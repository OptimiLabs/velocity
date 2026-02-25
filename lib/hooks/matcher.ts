import type { HookConfig } from "@/components/settings/HookEditor";

/**
 * Claude Code's actual hooks format: each event maps to an array of "rules",
 * where each rule has an optional `matcher` (regex for tool names) and a
 * `hooks` sub-array of HookConfig objects.
 *
 * Example:
 *   "PreToolUse": [
 *     { "matcher": "Bash", "hooks": [{ "type": "command", "command": "..." }] }
 *   ]
 */
export interface HookRule {
  matcher?: string;
  hooks: HookConfig[];
}

/** Flat representation of a single hook with its context for display */
export interface HookMatch {
  event: string;
  rule: HookRule;
  hook: HookConfig;
  relevance: "direct" | "lifecycle" | "global";
}

export interface GroupedHooks {
  direct: HookMatch[];
  lifecycle: HookMatch[];
  global: HookMatch[];
}

/** The raw hooks shape from settings.json */
export type RawHooks = Record<string, HookRule[]>;

/** Tool name that triggers when this entity type is invoked */
const ENTITY_TOOL_MAP: Record<string, string> = {
  skill: "Skill",
  agent: "Task",
  workflow: "Task",
};

/** Events that represent lifecycle hooks for agents/workflows */
const AGENT_LIFECYCLE_EVENTS = new Set(["SubagentStart", "SubagentStop", "TaskCompleted"]);

/**
 * Classify a rule for a given entity type.
 * Returns null if the rule is not relevant at all.
 *
 * Only returns non-null for hooks that genuinely relate to this entity:
 * - "direct": PreToolUse/PostToolUse with a matcher that matches this entity's tool name
 * - "lifecycle": SubagentStart/SubagentStop/TaskCompleted for agents/workflows
 *
 * Session-level events (SessionStart, Stop, Error, etc.) are excluded — they
 * fire regardless of which entity is running and don't belong on entity cards.
 */
function classifyRule(
  event: string,
  rule: HookRule,
  entityType: "skill" | "agent" | "workflow",
): HookMatch["relevance"] | null {
  const toolName = ENTITY_TOOL_MAP[entityType];
  const matcher = rule.matcher ?? null;

  // PreToolUse / PostToolUse — only include if matcher targets this entity's tool
  if (event === "PreToolUse" || event === "PostToolUse") {
    if (!matcher) return null; // no matcher = fires for all tools, not entity-specific
    try {
      return new RegExp(matcher).test(toolName) ? "direct" : null;
    } catch {
      return null;
    }
  }

  // Agent/workflow lifecycle events (SubagentStart, SubagentStop, TaskCompleted)
  if (AGENT_LIFECYCLE_EVENTS.has(event)) {
    return entityType === "agent" || entityType === "workflow"
      ? "lifecycle"
      : null;
  }

  // Everything else (SessionStart, Stop, Error, Notification, etc.)
  // is session-level — not relevant to a specific entity
  return null;
}

/**
 * Given an entity type and all configured hooks (in Claude Code's nested format),
 * return hooks grouped by relevance tier: direct, lifecycle, global.
 */
export function getRelevantHooks(
  entityType: "skill" | "agent" | "workflow",
  allHooks: RawHooks,
): GroupedHooks {
  const result: GroupedHooks = { direct: [], lifecycle: [], global: [] };

  for (const [event, rules] of Object.entries(allHooks)) {
    if (!Array.isArray(rules)) continue;
    for (const rule of rules) {
      if (!rule.hooks || !Array.isArray(rule.hooks)) continue;
      const relevance = classifyRule(event, rule, entityType);
      if (!relevance) continue;
      for (const hook of rule.hooks) {
        result[relevance].push({ event, rule, hook, relevance });
      }
    }
  }

  return result;
}

/** Returns the pre-filled matcher string for creating a new hook for this entity type */
export function getPrefilledMatcher(
  entityType: "skill" | "agent" | "workflow",
): string {
  return ENTITY_TOOL_MAP[entityType];
}
