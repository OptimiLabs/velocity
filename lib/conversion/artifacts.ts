import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { Agent } from "@/types/agent";
import type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowScopedAgent,
} from "@/types/workflow";
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
import { writeToml } from "@/lib/codex/toml";
import { saveGeminiSkill } from "@/lib/gemini/skills";
import { saveProviderAgent } from "@/lib/providers/agent-files";
import { saveProviderHookFile } from "@/lib/providers/hook-files";
import { indexFile } from "@/lib/instructions/indexer";
import { createWorkflow } from "@/lib/db/workflows";
import { upsertWorkflowAgent } from "@/lib/db/workflow-agents";
import { GEMINI_HOME } from "@/lib/gemini/paths";
import {
  CLAUDE_AGENT_MODEL_OPTIONS,
  CODEX_MODEL_OPTIONS,
  GEMINI_MODEL_OPTIONS,
} from "@/lib/models/provider-models";

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

export interface NormalizedWorkflowArtifact {
  provider?: ProviderTarget;
  name: string;
  description: string;
  generatedPlan?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  cwd?: string;
  commandName?: string | null;
  commandDescription?: string | null;
  activationContext?: string | null;
  autoSkillEnabled?: boolean;
  projectId?: string;
  projectPath?: string;
  scopedAgents?: WorkflowScopedAgent[];
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

type EffortLevel = "low" | "medium" | "high";
type ModelTier = "fast" | "balanced" | "high";

const CLAUDE_MODEL_IDS = new Set(
  CLAUDE_AGENT_MODEL_OPTIONS.map((model) => model.id.toLowerCase()),
);
const CODEX_MODEL_IDS = new Set(
  CODEX_MODEL_OPTIONS.map((model) => model.id.toLowerCase()),
);
const GEMINI_MODEL_IDS = new Set(
  GEMINI_MODEL_OPTIONS.map((model) => model.id.toLowerCase()),
);

const MODEL_BY_TIER: Record<ProviderTarget, Record<ModelTier, string>> = {
  claude: {
    fast: "haiku",
    balanced: "sonnet",
    high: "opus",
  },
  codex: {
    fast: "gpt-5.1-codex-mini",
    balanced: "gpt-5.1-codex",
    high: "gpt-5.3-codex",
  },
  gemini: {
    fast: "gemini-3-flash",
    balanced: "gemini-3-pro",
    high: "gemini-3-deep-think",
  },
};

interface WorkflowConversionStats {
  remappedModels: number;
  synthesizedModels: number;
  inferredEffort: number;
  invalidEffort: number;
}

function normalizeEffortLevel(value: unknown): EffortLevel | undefined {
  if (value !== "low" && value !== "medium" && value !== "high") {
    return undefined;
  }
  return value;
}

function tierFromEffort(effort?: EffortLevel): ModelTier | undefined {
  if (!effort) return undefined;
  if (effort === "low") return "fast";
  if (effort === "high") return "high";
  return "balanced";
}

function effortFromTier(tier: ModelTier): EffortLevel {
  if (tier === "fast") return "low";
  if (tier === "high") return "high";
  return "medium";
}

function inferModelTier(model?: string): ModelTier {
  if (!model) return "balanced";
  const normalized = model.trim().toLowerCase();
  if (!normalized) return "balanced";

  if (
    normalized.includes("haiku") ||
    normalized.includes("mini") ||
    normalized.includes("flash")
  ) {
    return "fast";
  }

  if (
    normalized.includes("opus") ||
    normalized.includes("deep-think") ||
    normalized.includes("max") ||
    normalized.includes("o3") ||
    normalized.endsWith("-pro") ||
    normalized.includes(" pro")
  ) {
    return "high";
  }

  return "balanced";
}

function isModelForProvider(model: string, target: ProviderTarget): boolean {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return false;

  if (target === "claude") {
    return CLAUDE_MODEL_IDS.has(normalized) || normalized.startsWith("claude-");
  }
  if (target === "codex") {
    return (
      CODEX_MODEL_IDS.has(normalized) ||
      normalized.startsWith("gpt-") ||
      normalized.startsWith("o1") ||
      normalized.startsWith("o3") ||
      normalized.startsWith("o4") ||
      normalized.startsWith("codex-")
    );
  }
  return GEMINI_MODEL_IDS.has(normalized) || normalized.startsWith("gemini-");
}

function mapModelForProvider(
  model: string | undefined,
  target: ProviderTarget,
  tier: ModelTier,
): { model?: string; remapped: boolean } {
  if (!model) return { remapped: false };
  const trimmed = model.trim();
  if (!trimmed) return { remapped: false };
  if (isModelForProvider(trimmed, target)) {
    return { model: trimmed, remapped: false };
  }
  return {
    model: MODEL_BY_TIER[target][tier],
    remapped: true,
  };
}

function convertWorkflowNodeForTarget(
  node: WorkflowNode,
  target: ProviderTarget,
  stats: WorkflowConversionStats,
): WorkflowNode {
  const next: WorkflowNode = { ...node };
  const normalizedEffort = normalizeEffortLevel(node.effort);
  if (node.effort !== undefined && !normalizedEffort) {
    stats.invalidEffort += 1;
  }

  const tier = tierFromEffort(normalizedEffort) ?? inferModelTier(node.model);
  const mapped = mapModelForProvider(node.model, target, tier);
  if (mapped.remapped) stats.remappedModels += 1;

  if (mapped.model) {
    next.model = mapped.model;
  } else if (normalizedEffort) {
    next.model = MODEL_BY_TIER[target][tier];
    stats.synthesizedModels += 1;
  } else {
    delete next.model;
  }

  if (normalizedEffort) {
    next.effort = normalizedEffort;
  } else if (next.model) {
    next.effort = effortFromTier(tier);
    stats.inferredEffort += 1;
  } else {
    delete next.effort;
  }

  if (node.overrides) {
    const nextOverrides = { ...node.overrides };
    const overridesEffort = normalizeEffortLevel(node.overrides.effort);
    if (node.overrides.effort !== undefined && !overridesEffort) {
      stats.invalidEffort += 1;
    }
    const overridesTier =
      tierFromEffort(overridesEffort) ?? inferModelTier(node.overrides.model);
    const mappedOverridesModel = mapModelForProvider(
      node.overrides.model,
      target,
      overridesTier,
    );
    if (mappedOverridesModel.remapped) stats.remappedModels += 1;

    if (mappedOverridesModel.model) {
      nextOverrides.model = mappedOverridesModel.model;
    } else {
      delete nextOverrides.model;
    }

    if (overridesEffort) {
      nextOverrides.effort = overridesEffort;
    } else if (nextOverrides.model) {
      nextOverrides.effort = effortFromTier(overridesTier);
      stats.inferredEffort += 1;
    } else {
      delete nextOverrides.effort;
    }

    next.overrides = nextOverrides;
  }

  return next;
}

function convertScopedWorkflowAgentForTarget(
  agent: WorkflowScopedAgent,
  target: ProviderTarget,
  stats: WorkflowConversionStats,
): WorkflowScopedAgent {
  const next: WorkflowScopedAgent = { ...agent };
  const normalizedEffort = normalizeEffortLevel(agent.effort);
  if (agent.effort !== undefined && !normalizedEffort) {
    stats.invalidEffort += 1;
  }
  const tier = tierFromEffort(normalizedEffort) ?? inferModelTier(agent.model);
  const mapped = mapModelForProvider(agent.model, target, tier);
  if (mapped.remapped) stats.remappedModels += 1;

  if (mapped.model) {
    next.model = mapped.model;
  } else if (normalizedEffort) {
    next.model = MODEL_BY_TIER[target][tier];
    stats.synthesizedModels += 1;
  } else {
    delete next.model;
  }

  if (normalizedEffort) {
    next.effort = normalizedEffort;
  } else if (next.model) {
    next.effort = effortFromTier(tier);
    stats.inferredEffort += 1;
  } else {
    delete next.effort;
  }

  return next;
}

function formatWorkflowFileName(name: string, target: ProviderTarget): string {
  const safe = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safe || "workflow"}.${target}.workflow.json`;
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

function renderCodexAgentMarkdown(
  agent: NormalizedAgentArtifact,
): string {
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
  };
  if (agent.model) frontmatter.model = agent.model;
  if (agent.effort) frontmatter.effort = agent.effort;
  if (agent.tools?.length) frontmatter.tools = agent.tools.join(", ");
  if (agent.color) frontmatter.color = agent.color;
  if (agent.category) frontmatter.category = agent.category;
  if (agent.areaPath) frontmatter.areaPath = agent.areaPath;
  return matter.stringify(agent.prompt || "", frontmatter).trim() + "\n";
}

function renderGeminiAgentMarkdown(
  agent: NormalizedAgentArtifact,
): string {
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
  };
  if (agent.model) frontmatter.model = agent.model;
  if (agent.effort) frontmatter.effort = agent.effort;
  if (agent.tools?.length) frontmatter.tools = agent.tools.join(", ");
  if (agent.color) frontmatter.color = agent.color;
  if (agent.category) frontmatter.category = agent.category;
  if (agent.areaPath) frontmatter.areaPath = agent.areaPath;
  return matter.stringify(agent.prompt || "", frontmatter).trim() + "\n";
}

function renderClaudeSkillMarkdown(skill: NormalizedSkillArtifact): string {
  const frontmatter: Record<string, unknown> = { name: skill.name };
  if (skill.description) frontmatter.description = skill.description;
  if (skill.category) frontmatter.category = skill.category;
  return matter.stringify(skill.content || "", frontmatter).trim() + "\n";
}

function renderCodexSkillMarkdown(skill: NormalizedSkillArtifact): string {
  const frontmatter: Record<string, unknown> = { name: skill.name };
  if (skill.description) frontmatter.description = skill.description;
  if (skill.category) frontmatter.category = skill.category;
  return matter.stringify(skill.content || "", frontmatter).trim() + "\n";
}

function renderGeminiSkillMarkdown(skill: NormalizedSkillArtifact): string {
  const frontmatter: Record<string, unknown> = { name: skill.name };
  if (skill.description) frontmatter.description = skill.description;
  if (skill.category) frontmatter.category = skill.category;
  return matter.stringify(skill.content || "", frontmatter).trim() + "\n";
}

function getGeminiCommandPath(name: string, projectPath?: string): string {
  const safe = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";
  const baseDir = projectPath
    ? path.join(projectPath, ".gemini")
    : GEMINI_HOME;
  return path.join(baseDir, "commands", `${safe}.toml`);
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

    const preview =
      target === "codex"
        ? renderCodexAgentMarkdown(agent)
        : renderGeminiAgentMarkdown(agent);
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

    const md =
      target === "codex"
        ? renderCodexSkillMarkdown(skill)
        : renderGeminiSkillMarkdown(skill);
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

export function convertWorkflowTargets(
  workflow: NormalizedWorkflowArtifact,
  targetProvider: ProviderTargetMode | ProviderTarget[] | undefined,
): ArtifactConversionResult<ConvertedArtifactOutput>[] {
  return normalizeProviderTargets(targetProvider).map((target) => {
    const cap = getProviderArtifactCapability(target, "workflow");
    const stats: WorkflowConversionStats = {
      remappedModels: 0,
      synthesizedModels: 0,
      inferredEffort: 0,
      invalidEffort: 0,
    };

    const converted: NormalizedWorkflowArtifact = {
      ...workflow,
      provider: target,
      nodes: (workflow.nodes ?? []).map((node) =>
        convertWorkflowNodeForTarget(node, target, stats),
      ),
      edges: (workflow.edges ?? []).map((edge) => ({ ...edge })),
      scopedAgents: (workflow.scopedAgents ?? []).map((agent) =>
        convertScopedWorkflowAgentForTarget(agent, target, stats),
      ),
    };

    const issues = [
      ...toIssues(cap.reason),
      ...(stats.remappedModels > 0
        ? toIssues(
            `Remapped ${stats.remappedModels} model value${stats.remappedModels === 1 ? "" : "s"} for ${target}.`,
          )
        : []),
      ...(stats.synthesizedModels > 0
        ? toIssues(
            `Applied ${stats.synthesizedModels} provider-default model${stats.synthesizedModels === 1 ? "" : "s"} based on effort.`,
          )
        : []),
      ...(stats.inferredEffort > 0
        ? toIssues(
            `Inferred ${stats.inferredEffort} effort value${stats.inferredEffort === 1 ? "" : "s"} from model tier.`,
          )
        : []),
      ...(stats.invalidEffort > 0
        ? toIssues(
            `Dropped ${stats.invalidEffort} invalid effort value${stats.invalidEffort === 1 ? "" : "s"} during conversion.`,
          )
        : []),
    ];

    const preview = JSON.stringify(converted, null, 2);
    return {
      target,
      saveSupported: cap.saveSupported,
      supported: true,
      output: {
        config: converted as unknown as Record<string, unknown>,
        content: preview,
        fileName: formatWorkflowFileName(workflow.name, target),
      },
      previewText: preview,
      fileName: formatWorkflowFileName(workflow.name, target),
      issues,
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
  baseWorkflow?: NormalizedWorkflowArtifact;
  overwrite?: boolean;
  results: ArtifactConversionResult<ConvertedArtifactOutput>[];
}): Promise<ArtifactConversionResult<ConvertedArtifactOutput>[]> {
  const {
    artifactType,
    source,
    baseAgent,
    baseSkill,
    baseWorkflow,
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
          const normalizedPrompt = baseSkill.content?.trim()
            ? `${baseSkill.content.trim()}\n`
            : "";
          const tomlPath = getGeminiCommandPath(
            baseSkill.name,
            baseSkill.visibility === "project" ? baseSkill.projectPath : undefined,
          );
          writeToml(tomlPath, {
            prompt: normalizedPrompt,
            ...(baseSkill.description?.trim()
              ? { description: baseSkill.description.trim() }
              : {}),
          });
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
      } else if (artifactType === "workflow" && baseWorkflow) {
        const workflowConfig = (result.output.config as
          | NormalizedWorkflowArtifact
          | undefined) ?? {
          ...baseWorkflow,
          provider: result.target,
        };

        const created = createWorkflow({
          provider: result.target,
          name: workflowConfig.name || baseWorkflow.name,
          description: workflowConfig.description ?? baseWorkflow.description ?? "",
          generatedPlan:
            workflowConfig.generatedPlan ?? baseWorkflow.generatedPlan ?? "",
          nodes: workflowConfig.nodes ?? baseWorkflow.nodes ?? [],
          edges: workflowConfig.edges ?? baseWorkflow.edges ?? [],
          cwd: workflowConfig.cwd ?? baseWorkflow.cwd ?? "",
          commandName:
            workflowConfig.commandName ?? baseWorkflow.commandName ?? null,
          commandDescription:
            workflowConfig.commandDescription ??
            baseWorkflow.commandDescription ??
            null,
          activationContext:
            workflowConfig.activationContext ??
            baseWorkflow.activationContext ??
            null,
          autoSkillEnabled:
            workflowConfig.autoSkillEnabled ?? baseWorkflow.autoSkillEnabled,
          projectId: workflowConfig.projectId ?? baseWorkflow.projectId,
          projectPath: workflowConfig.projectPath ?? baseWorkflow.projectPath,
        });

        for (const scopedAgent of workflowConfig.scopedAgents ?? []) {
          if (!scopedAgent?.name?.trim()) continue;
          upsertWorkflowAgent(created.id, {
            name: scopedAgent.name,
            description: scopedAgent.description,
            model: scopedAgent.model,
            effort: scopedAgent.effort,
            tools: scopedAgent.tools ?? [],
            disallowedTools: scopedAgent.disallowedTools ?? [],
            color: scopedAgent.color,
            icon: scopedAgent.icon,
            category: scopedAgent.category,
            prompt: scopedAgent.prompt ?? "",
            skills: scopedAgent.skills ?? [],
          });
        }

        filePath = `workflow:${created.id}`;
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
