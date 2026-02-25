import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { requireAIProvider } from "@/lib/providers/ai-registry";
import type {
  EditRequest,
  EditResult,
  EditorType,
  ComposeMode,
  AIProviderType,
} from "@/types/instructions";

function buildPrompt(userPrompt: string, originalContent: string): string {
  return `<instructions>
You are editing a markdown instruction file. Apply the user's requested changes to the content below.
Return ONLY the edited content — no explanations, no code fences, no preamble.
</instructions>

<user_request>
${userPrompt}
</user_request>

<original_content>
${originalContent}
</original_content>`;
}

async function editWithClaudeCLI(
  prompt: string,
  originalContent: string,
): Promise<EditResult> {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `claude-edit-${Date.now()}.md`);

  try {
    fs.writeFileSync(tmpFile, originalContent, "utf-8");

    const fullPrompt = buildPrompt(prompt, originalContent);
    const result = execSync(
      `claude --print -p "${fullPrompt.replace(/"/g, '\\"')}"`,
      {
        encoding: "utf-8",
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    return {
      content: result.trim(),
      tokensUsed: 0,
      cost: 0,
      editorType: "ai-claude-cli" as EditorType,
    };
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

export async function editWithAI(request: EditRequest): Promise<EditResult> {
  const { provider, prompt, originalContent } = request;

  if (provider === "claude-cli") {
    return editWithClaudeCLI(prompt, originalContent);
  }

  const fullPrompt = buildPrompt(prompt, originalContent);
  return callProvider(provider, fullPrompt);
}

// --- Compose / Summarize ---

export function buildComposePrompt(
  sources: { name: string; path: string; content: string }[],
  userPrompt: string,
  mode: ComposeMode,
): string {
  const sourceBlocks = sources
    .map(
      (s, i) =>
        `<source_${i + 1} name="${s.name}" path="${s.path}">\n${s.content}\n</source_${i + 1}>`,
    )
    .join("\n\n");

  if (mode === "summarize") {
    return `<instructions>
Summarize the following instruction files into a concise, well-organized markdown document.
Preserve the most important rules, guidelines, and patterns. Remove redundancy and merge overlapping sections.
Return ONLY the summarized markdown content — no explanations, no code fences, no preamble.
</instructions>

<user_request>
${userPrompt}
</user_request>

<source_files>
${sourceBlocks}
</source_files>`;
  }

  return `<instructions>
You are creating a new CLAUDE.md instruction file by combining the best elements from multiple source files.
Merge guidelines intelligently: deduplicate, resolve conflicts (prefer the more specific rule), and organize into clear sections.
Return ONLY the composed markdown content — no explanations, no code fences, no preamble.
</instructions>

<user_request>
${userPrompt}
</user_request>

<source_files>
${sourceBlocks}
</source_files>`;
}

export async function composeWithAI(
  sources: { name: string; path: string; content: string }[],
  userPrompt: string,
  mode: ComposeMode,
  provider: EditRequest["provider"],
): Promise<EditResult> {
  const composedPrompt = buildComposePrompt(sources, userPrompt, mode);

  if (provider === "claude-cli") {
    return callProviderCLI(composedPrompt);
  }

  return callProvider(provider, composedPrompt);
}

export async function callProvider(
  provider: AIProviderType | "openrouter" | "local",
  fullPrompt: string,
  modelOverride?: string,
): Promise<EditResult> {
  const adapter = requireAIProvider(
    provider === "openrouter" || provider === "local" ? "custom" : provider,
  );
  const response = await adapter.complete({
    prompt: fullPrompt,
    model: modelOverride,
    maxTokens: 8192,
  });
  return {
    content: response.content,
    tokensUsed: response.inputTokens + response.outputTokens,
    cost: response.cost,
    editorType: response.editorType,
  };
}

export function buildSkillMergePrompt(
  skills: { name: string; content: string }[],
  userPrompt: string,
  history?: { role: "user" | "assistant"; content: string }[],
): string {
  const skillBlocks = skills
    .map(
      (s, i) =>
        `<skill_${i + 1} name="${s.name}">\n${s.content}\n</skill_${i + 1}>`,
    )
    .join("\n\n");

  const historyBlock = history?.length
    ? `\n<conversation_history>\n${history.map((m) => `<${m.role}>${m.content}</${m.role}>`).join("\n")}\n</conversation_history>\n`
    : "";

  return `<instructions>
You are merging multiple Claude Code skills (slash commands) into a single, unified skill.
Analyze all the provided skills and create one cohesive skill that combines their functionality.

Rules:
- Merge overlapping instructions intelligently — deduplicate, resolve conflicts, keep the most specific version
- Preserve unique functionality from each skill
- Organize the merged content with clear sections
- If skills have categories, preserve the structural patterns appropriate for that category:
  - Domain Expertise: rules, conventions, good/bad examples
  - Workflow Automation: numbered steps with validation gates
  - MCP Enhancement: tool coordination with parameter mapping
- Return ONLY the merged skill content (markdown) — no explanations, no code fences, no preamble
- Also return a suggested name, description, and category for the merged skill

Format your response as:
---name: suggested-name
---description: A brief description of what the merged skill does
---category: domain-expertise | workflow-automation | mcp-enhancement (pick the best fit, or omit if unclear)
---content:
[merged skill content here]
</instructions>
${historyBlock}
<user_request>
${userPrompt}
</user_request>

<skills_to_merge>
${skillBlocks}
</skills_to_merge>`;
}

export async function mergeSkillsWithAI(
  skills: { name: string; content: string }[],
  userPrompt: string,
  provider: EditRequest["provider"],
  history?: { role: "user" | "assistant"; content: string }[],
): Promise<
  {
    content: string;
    name: string;
    description: string;
    category?: string;
  } & EditResult
> {
  const fullPrompt = buildSkillMergePrompt(skills, userPrompt, history);

  const result: EditResult =
    provider === "claude-cli"
      ? await callProviderCLI(fullPrompt)
      : await callProvider(provider, fullPrompt);

  // Parse structured response
  let name = skills.map((s) => s.name).join("-merged");
  let description = `Merged from: ${skills.map((s) => s.name).join(", ")}`;
  let category: string | undefined;
  let content = result.content;

  const nameMatch = content.match(/^---name:\s*(.+)$/m);
  const descMatch = content.match(/^---description:\s*(.+)$/m);
  const catMatch = content.match(/^---category:\s*(.+)$/m);
  const contentMatch = content.match(/^---content:\n([\s\S]*)$/m);

  if (nameMatch) name = nameMatch[1].trim();
  if (descMatch) description = descMatch[1].trim();
  if (catMatch) category = catMatch[1].trim();
  if (contentMatch) content = contentMatch[1].trim();

  return { ...result, content, name, description, category };
}

export async function callProviderCLI(fullPrompt: string): Promise<EditResult> {
  const result = execSync(
    `claude --print -p "${fullPrompt.replace(/"/g, '\\"')}"`,
    {
      encoding: "utf-8",
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  return {
    content: result.trim(),
    tokensUsed: 0,
    cost: 0,
    editorType: "ai-claude-cli",
  };
}
