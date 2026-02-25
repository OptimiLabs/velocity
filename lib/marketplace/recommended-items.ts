export type SkillGuideProvider = "claude" | "codex" | "gemini" | "all";

function providerLabel(provider: SkillGuideProvider): string {
  switch (provider) {
    case "codex":
      return "Codex CLI";
    case "gemini":
      return "Gemini CLI";
    case "all":
      return "cross-provider";
    case "claude":
    default:
      return "Claude Code";
  }
}

function providerSavePath(provider: SkillGuideProvider): string {
  switch (provider) {
    case "codex":
      return "~/.codex/skills/<name>/SKILL.md";
    case "gemini":
      return "~/.gemini/skills/<name>/SKILL.md";
    case "all":
      return "provider-native skill path (Claude: ~/.claude/skills/<name>/SKILL.md, Codex: ~/.codex/skills/<name>/SKILL.md, Gemini: ~/.gemini/skills/<name>/SKILL.md)";
    case "claude":
    default:
      return "~/.claude/skills/<name>/SKILL.md";
  }
}

function buildSkillCreatorGuide(provider: SkillGuideProvider): string {
  const label = providerLabel(provider);
  const savePath = providerSavePath(provider);
  return `# Skill Creator

You are a skill authoring assistant. When the user asks you to create, review, or improve a ${label} skill, follow this process:

## Creating a New Skill

1. **Clarify the purpose** — Ask what the skill should do, when it triggers, and what outcome is expected.
2. **Draft the frontmatter** — Write a YAML frontmatter block with \`name\` and \`description\`.
3. **Write the body** — Provide clear, imperative instructions. Use markdown sections for organization.
4. **Include examples** — Add 1-2 usage examples showing the skill in action.
5. **Save** — Write the skill to \`${savePath}\`.

## Reviewing a Skill

1. **Read the skill file** and analyze its structure.
2. **Check for**: clear purpose, specific instructions, proper frontmatter, edge case handling.
3. **Suggest improvements** with concrete rewrites.

## Best Practices

- Keep skills focused on a single task or workflow
- Use imperative voice ("Do X", not "You should do X")
- Include guardrails for what the skill should NOT do
- Reference specific tools or file paths when relevant
- Test skills by invoking them after creation

## Ecosystem Fit

- Prefer skills that can compose with agents, hooks, workflows, and MCP-backed tool flows when appropriate
- Include explicit validation checkpoints (how to confirm the step succeeded)
- Include "when not to use" guidance to prevent misuse
- Include failure handling and fallback behavior for common issues
- Make outputs actionable for teams (clear next steps, artifacts, and decision criteria)
`;
}

/**
 * Claude guide kept as the default export for backwards compatibility.
 */
export const SKILL_CREATOR_GUIDE = buildSkillCreatorGuide("claude");

export function getSkillCreatorGuide(
  provider: SkillGuideProvider = "claude",
): string {
  return buildSkillCreatorGuide(provider);
}
