import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { Agent } from "@/types/agent";
import type {
  ArtifactType,
  ArtifactConversionIssue,
  ArtifactConversionResult,
  ProviderTarget,
  ProviderTargetMode,
} from "@/types/provider-artifacts";
import { normalizeProviderTargets } from "@/types/provider-artifacts";
import { getProviderArtifactCapability } from "@/lib/providers/artifact-capabilities";
import { getProviderFs } from "@/lib/providers/filesystem-registry";
import { saveSkill, saveProjectSkill } from "@/lib/skills";
import { saveAgent, saveProjectAgent } from "@/lib/agents/parser";
import { saveCodexInstruction } from "@/lib/codex/skills";
import { saveGeminiSkill } from "@/lib/gemini/skills";
import { saveProviderAgent } from "@/lib/providers/agent-files";
import { saveProviderHookFile } from "@/lib/providers/hook-files";
import { indexFile } from "@/lib/instructions/indexer";

export interface NormalizedAgentArtifact {
  name: string;
  description: string;
  prompt: string;
  model?: string;
  effort?: "low" | "medium" | "high";
  tools?: string[];
  color?: string;
  category?: string;
  scope?: "global" | "project";
  projectPath?: string;
  areaPath?: string;
}

export interface NormalizedSkillArtifact {
  name: string;
  description?: string;
  content: string;
  category?: string;
  visibility?: "global" | "project";
  projectPath?: string;
}

export interface NormalizedHookArtifact {
  event: string;
  matcher?: string;
  hook: {
    type: "command" | "prompt" | "agent";
    command?: string;
    prompt?: string;
    timeout?: number;
    async?: boolean;
  };
}

export interface NormalizedInstructionArtifact {
  fileName?: string;
  content: string;
  projectPath?: string | null;
  filePath?: string;
}

export interface ConvertedArtifactOutput {
  content?: string;
  config?: Record<string, unknown>;
  fileName?: string;
}

function toIssues(...messages: Array<string | null | undefined>): ArtifactConversionIssue[] {
  return messages.filter(Boolean).map((message) => ({
    level: "warning" as const,
    message: message!,
  }));
}

export function renderClaudeAgentMarkdown(agent: NormalizedAgentArtifact): string {
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
  };
  if (agent.model) frontmatter.model = agent.model;
  if (agent.effort) frontmatter.effort = agent.effort;
  if (agent.tools?.length) frontmatter.tools = agent.tools.join(", ");
  if (agent.color) frontmatter.color = agent.color;
  if (agent.category) frontmatter.category = agent.category;
  if (agent.scope === "project" && agent.areaPath) {
    frontmatter.areaPath = agent.areaPath;
  }
  return matter.stringify(agent.prompt || "", frontmatter).trim() + "\n";
}

function renderPortableAgentMarkdown(
  agent: NormalizedAgentArtifact,
  target: Exclude<ProviderTarget, "claude">,
): string {
  const title = `${agent.name} (${target.toUpperCase()} profile)`;
  const tools = agent.tools?.length
    ? `\n## Tools\n${agent.tools.map((t) => `- ${t}`).join("\n")}\n`
    : "";
  const meta = [
    agent.description ? `Description: ${agent.description}` : null,
    agent.model ? `Model preference: ${agent.model}` : null,
    agent.effort ? `Reasoning effort: ${agent.effort}` : null,
    agent.color ? `Color hint: ${agent.color}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return [
    `# ${title}`,
    "",
    meta || "Converted agent profile",
    tools.trimEnd(),
    "",
    "## Instructions",
    agent.prompt || "",
    "",
  ]
    .filter((v) => v !== "")
    .join("\n");
}

function renderClaudeSkillMarkdown(skill: NormalizedSkillArtifact): string {
  const frontmatter: Record<string, unknown> = { name: skill.name };
  if (skill.description) frontmatter.description = skill.description;
  if (skill.category) frontmatter.category = skill.category;
  return matter.stringify(skill.content || "", frontmatter).trim() + "\n";
}

function renderPortableSkillMarkdown(
  skill: NormalizedSkillArtifact,
  target: Exclude<ProviderTarget, "claude">,
): string {
  const header = skill.content.trim().startsWith("#")
    ? skill.content.trim()
    : `# ${skill.name}\n\n${skill.content.trim()}`;
  return [
    `<!-- Converted for ${target} -->`,
    skill.description ? `<!-- ${skill.description} -->` : null,
    header,
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

function renderHookPreview(hook: NormalizedHookArtifact, target: ProviderTarget): string {
  if (target === "claude") {
    return JSON.stringify(
      {
        event: hook.event,
        ...(hook.matcher ? { matcher: hook.matcher } : {}),
        hook: hook.hook,
      },
      null,
      2,
    );
  }
  return [
    `# ${target.toUpperCase()} hook conversion preview`,
    "",
    "This provider uses app-managed hook artifact files for parity.",
    "Hook JSON:",
    "",
    "```json",
    JSON.stringify(
      {
        event: hook.event,
        ...(hook.matcher ? { matcher: hook.matcher } : {}),
        hook: hook.hook,
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

function inferInstructionSavePath(
  target: ProviderTarget,
  source: NormalizedInstructionArtifact,
): string {
  const fsDef = getProviderFs(target);
  if (source.projectPath) {
    return path.join(source.projectPath, fsDef.entrypointFileName);
  }
  return path.join(fsDef.configDir, fsDef.entrypointFileName);
}

function renderInstructionContent(
  source: NormalizedInstructionArtifact,
  target: ProviderTarget,
): { content: string; fileName: string; issues: ArtifactConversionIssue[] } {
  const fsDef = getProviderFs(target);
  const content = source.content;
  const fileName = fsDef.entrypointFileName;
  const issues = toIssues(
    source.fileName && source.fileName !== fileName
      ? `Target provider entrypoint file will be named ${fileName} (source was ${source.fileName}).`
      : null,
  );
  return { content, fileName, issues };
}

export function convertAgentTargets(
  agent: NormalizedAgentArtifact,
  targetProvider: ProviderTargetMode | ProviderTarget[] | undefined,
): ArtifactConversionResult<ConvertedArtifactOutput>[] {
  return normalizeProviderTargets(targetProvider).map((target) => {
    const cap = getProviderArtifactCapability(target, "agent");
    const issues = [...toIssues(cap.reason)];

    if (target === "claude") {
      const config: Record<string, unknown> = {
        name: agent.name,
        description: agent.description,
        prompt: agent.prompt,
      };
      if (agent.model) config.model = agent.model;
      if (agent.effort) config.effort = agent.effort;
      if (agent.tools) config.tools = agent.tools;
      if (agent.color) config.color = agent.color;
      if (agent.category) config.category = agent.category;
      if (agent.scope) config.scope = agent.scope;
      if (agent.projectPath) config.projectPath = agent.projectPath;
      if (agent.areaPath) config.areaPath = agent.areaPath;
      return {
        target,
        saveSupported: cap.saveSupported,
        supported: true,
        output: { config, content: renderClaudeAgentMarkdown(agent), fileName: `${agent.name}.md` },
        previewText: renderClaudeAgentMarkdown(agent),
        fileName: `${agent.name}.md`,
        issues,
      };
    }

    const preview = renderPortableAgentMarkdown(agent, target);
    return {
      target,
      saveSupported: cap.saveSupported,
      supported: true,
      output: {
        content: preview,
        fileName: `${agent.name}.md`,
        config: {
          name: agent.name,
          description: agent.description,
          prompt: agent.prompt,
          ...(agent.model ? { model: agent.model } : {}),
          ...(agent.effort ? { effort: agent.effort } : {}),
          ...(agent.tools ? { tools: agent.tools } : {}),
          ...(agent.color ? { color: agent.color } : {}),
          ...(agent.category ? { category: agent.category } : {}),
          ...(agent.scope ? { scope: agent.scope } : {}),
          ...(agent.projectPath ? { projectPath: agent.projectPath } : {}),
          ...(agent.areaPath ? { areaPath: agent.areaPath } : {}),
        },
      },
      previewText: preview,
      fileName: `${agent.name}.md`,
      issues,
    };
  });
}

export function convertSkillTargets(
  skill: NormalizedSkillArtifact,
  targetProvider: ProviderTargetMode | ProviderTarget[] | undefined,
): ArtifactConversionResult<ConvertedArtifactOutput>[] {
  return normalizeProviderTargets(targetProvider).map((target) => {
    const cap = getProviderArtifactCapability(target, "skill");
    const issues = [...toIssues(cap.reason)];

    if (target === "claude") {
      const md = renderClaudeSkillMarkdown(skill);
      return {
        target,
        saveSupported: cap.saveSupported,
        supported: true,
        output: { content: md, fileName: `${skill.name}.md` },
        previewText: md,
        fileName: `${skill.name}.md`,
        issues,
      };
    }

    const md = renderPortableSkillMarkdown(skill, target);
    return {
      target,
      saveSupported: cap.saveSupported,
      supported: true,
      output: { content: md, fileName: `${skill.name}.md` },
      previewText: md,
      fileName: `${skill.name}.md`,
      issues,
    };
  });
}

export function convertHookTargets(
  hook: NormalizedHookArtifact,
  targetProvider: ProviderTargetMode | ProviderTarget[] | undefined,
): ArtifactConversionResult<ConvertedArtifactOutput>[] {
  return normalizeProviderTargets(targetProvider).map((target) => {
    const cap = getProviderArtifactCapability(target, "hook");
    const issues = [...toIssues(cap.reason)];
    const preview = renderHookPreview(hook, target);
    return {
      target,
      saveSupported: cap.saveSupported,
      supported: true,
      output: {
        content: preview,
        config: {
          event: hook.event,
          ...(hook.matcher ? { matcher: hook.matcher } : {}),
          hook: hook.hook,
        },
        fileName: `${hook.event.toLowerCase()}-${hook.hook.type}.json`,
      },
      previewText: preview,
      fileName: `${hook.event.toLowerCase()}-${hook.hook.type}.json`,
      issues,
    };
  });
}

export function convertInstructionTargets(
  instruction: NormalizedInstructionArtifact,
  targetProvider: ProviderTargetMode | ProviderTarget[] | undefined,
): ArtifactConversionResult<ConvertedArtifactOutput>[] {
  return normalizeProviderTargets(targetProvider).map((target) => {
    const cap = getProviderArtifactCapability(target, "instruction");
    const rendered = renderInstructionContent(instruction, target);
    return {
      target,
      saveSupported: cap.saveSupported,
      supported: true,
      output: {
        content: rendered.content,
        fileName: rendered.fileName,
      },
      previewText: rendered.content,
      fileName: rendered.fileName,
      issues: rendered.issues,
    };
  });
}

export async function saveConvertedResults(params: {
  artifactType: ArtifactType;
  source?: {
    projectPath?: string | null;
  };
  baseAgent?: NormalizedAgentArtifact;
  baseSkill?: NormalizedSkillArtifact;
  overwrite?: boolean;
  results: ArtifactConversionResult<ConvertedArtifactOutput>[];
}): Promise<ArtifactConversionResult<ConvertedArtifactOutput>[]> {
  const {
    artifactType,
    source,
    baseAgent,
    baseSkill,
    overwrite = false,
    results,
  } = params;

  const out: ArtifactConversionResult<ConvertedArtifactOutput>[] = [];

  for (const result of results) {
    const issues = [...result.issues];
    let filePath = result.filePath;
    let saved = false;

    if (!result.saveSupported || !result.output) {
      out.push({ ...result, issues, saved: false });
      continue;
    }

    try {
      if (artifactType === "instruction") {
        const content = result.output.content ?? "";
        const resolvedPath = inferInstructionSavePath(result.target, {
          content,
          fileName: result.output.fileName,
          projectPath: source?.projectPath,
        });
        if (!overwrite && fs.existsSync(resolvedPath)) {
          issues.push({
            level: "error",
            message: `Target file already exists: ${resolvedPath}`,
          });
        } else {
          fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
          fs.writeFileSync(resolvedPath, content, "utf-8");
          indexFile(resolvedPath, source?.projectPath || null, null);
          filePath = resolvedPath;
          saved = true;
        }
      } else if (artifactType === "skill" && baseSkill) {
        if (result.target === "claude") {
          if (baseSkill.visibility === "project" && baseSkill.projectPath) {
            saveProjectSkill(
              baseSkill.projectPath,
              baseSkill.name,
              baseSkill.description,
              baseSkill.content,
              baseSkill.category as import("@/lib/skills").SkillCategory | undefined,
            );
          } else {
            saveSkill(
              baseSkill.name,
              baseSkill.description,
              baseSkill.content,
              baseSkill.category as import("@/lib/skills").SkillCategory | undefined,
            );
          }
          filePath = result.filePath;
          saved = true;
        } else if (result.target === "codex") {
          filePath = saveCodexInstruction(
            baseSkill.name,
            result.output.content ?? baseSkill.content,
            baseSkill.visibility === "project" ? baseSkill.projectPath : undefined,
          );
          saved = true;
        } else if (result.target === "gemini") {
          filePath = saveGeminiSkill(
            baseSkill.name,
            result.output.content ?? baseSkill.content,
            baseSkill.visibility === "project" ? baseSkill.projectPath : undefined,
          );
          saved = true;
        }
      } else if (artifactType === "agent" && baseAgent) {
        const agent: Agent = {
          name: baseAgent.name,
          description: baseAgent.description,
          prompt: baseAgent.prompt,
          filePath: "",
          model: baseAgent.model,
          effort: baseAgent.effort,
          tools: baseAgent.tools,
          color: baseAgent.color,
          category: baseAgent.category,
          scope: baseAgent.scope,
          projectPath: baseAgent.projectPath,
          areaPath: baseAgent.areaPath,
          provider: result.target,
        };
        if (result.target === "claude") {
          if (baseAgent.scope === "project" && baseAgent.projectPath) {
            saveProjectAgent(baseAgent.projectPath, agent);
          } else {
            saveAgent(agent);
          }
          filePath = result.filePath;
        } else {
          if (baseAgent.scope === "project" && !baseAgent.projectPath) {
            throw new Error(
              "projectPath is required to save project-scoped provider agents",
            );
          }
          filePath = saveProviderAgent(
            result.target,
            agent,
            baseAgent.scope === "project" ? baseAgent.projectPath : undefined,
          );
        }
        saved = true;
      } else if (artifactType === "hook") {
        const cfg = result.output.config as
          | {
              event?: string;
              matcher?: string;
              hook?: NormalizedHookArtifact["hook"];
            }
          | undefined;
        if (!cfg?.event || !cfg?.hook) {
          issues.push({
            level: "error",
            message: "Hook conversion is missing required event/hook fields",
          });
        } else {
          const savedHook = saveProviderHookFile({
            provider: result.target,
            projectPath: source?.projectPath ?? undefined,
            fileName: result.output.fileName,
            overwrite,
            hook: {
              event: cfg.event,
              matcher: typeof cfg.matcher === "string" ? cfg.matcher : undefined,
              hook: cfg.hook,
            },
          });
          filePath = savedHook.filePath;
          saved = true;
        }
      }
    } catch (error) {
      issues.push({
        level: "error",
        message: error instanceof Error ? error.message : "Failed to save converted artifact",
      });
    }

    out.push({ ...result, issues, filePath, saved });
  }

  return out;
}
