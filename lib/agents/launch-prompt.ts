import type { Agent } from "@/types/agent";

type AgentLaunchInput = Pick<
  Agent,
  | "name"
  | "prompt"
  | "provider"
  | "model"
  | "effort"
  | "skills"
  | "tools"
  | "disallowedTools"
>;

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const normalized = normalizeString(item);
    if (!normalized) continue;
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function formatList(values: string[], max = 10): string {
  if (values.length <= max) return values.join(", ");
  return `${values.slice(0, max).join(", ")} (+${values.length - max} more)`;
}

/**
 * Build a launch prompt that preserves agent instructions while surfacing
 * runtime constraints in plain language for CLI execution.
 */
export function composeAgentLaunchPrompt(agent: AgentLaunchInput): string {
  const basePrompt = normalizeString(agent.prompt) ?? "";
  const model = normalizeString(agent.model);
  const effort = normalizeString(agent.effort);
  const skills = normalizeStringList(agent.skills);
  const tools = normalizeStringList(agent.tools);
  const disallowedTools = normalizeStringList(agent.disallowedTools);
  const provider = normalizeString(agent.provider);

  const hasConstraints =
    !!model ||
    !!effort ||
    skills.length > 0 ||
    tools.length > 0 ||
    disallowedTools.length > 0 ||
    !!provider;

  if (!hasConstraints) return basePrompt;

  const lines: string[] = [];
  if (basePrompt) {
    lines.push(basePrompt, "", "---", "");
  }
  lines.push("Launch Profile (apply while executing this agent):");
  if (provider) {
    lines.push(`- Provider profile: ${provider}`);
  }
  if (model) {
    lines.push(`- Preferred model: ${model}`);
  }
  if (effort) {
    lines.push(`- Thinking effort: ${effort}`);
  }
  if (skills.length > 0) {
    lines.push(`- Skills to leverage: ${formatList(skills)}`);
  }
  if (tools.length > 0) {
    lines.push(`- Preferred tools: ${formatList(tools)}`);
  }
  if (disallowedTools.length > 0) {
    lines.push(`- Disallowed tools: ${formatList(disallowedTools)}`);
  }
  if (tools.some((tool) => tool.startsWith("mcp__"))) {
    lines.push(
      "- Use listed MCP/plugin-backed tools by exact name when relevant.",
    );
  }

  return lines.join("\n");
}
