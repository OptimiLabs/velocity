export type HookType = "command" | "prompt" | "agent";
export type EventSupport = "stable" | "conditional";

export interface EventRuntimeRequirement {
  support: EventSupport;
  summary: string;
  details: string;
}

export const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "Notification",
  "Stop",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "TaskCompleted",
  "TeammateIdle",
  "Setup",
  "ConfigChange",
  "WorktreeCreate",
  "WorktreeRemove",
];

export const EVENT_RUNTIME_REQUIREMENTS: Record<string, EventRuntimeRequirement> = {
  PreToolUse: {
    support: "stable",
    summary: "Stable",
    details: "Runs before a tool call.",
  },
  PostToolUse: {
    support: "stable",
    summary: "Stable",
    details: "Runs after a successful tool call.",
  },
  PostToolUseFailure: {
    support: "stable",
    summary: "Stable",
    details: "Runs after a failed tool call.",
  },
  PermissionRequest: {
    support: "conditional",
    summary: "Conditional",
    details:
      "Only fires when an interactive permission dialog appears. It may not fire in headless/print or auto-deny flows.",
  },
  Notification: {
    support: "conditional",
    summary: "Conditional",
    details:
      "Only fires when Claude emits a notification event.",
  },
  Stop: {
    support: "stable",
    summary: "Stable",
    details: "Runs when Claude is about to stop.",
  },
  SubagentStart: {
    support: "stable",
    summary: "Stable",
    details: "Runs when a subagent is spawned.",
  },
  SubagentStop: {
    support: "stable",
    summary: "Stable",
    details: "Runs when a subagent stops.",
  },
  PreCompact: {
    support: "stable",
    summary: "Stable",
    details: "Runs before context compaction (manual or automatic compact).",
  },
  SessionStart: {
    support: "stable",
    summary: "Stable",
    details: "Runs at session start.",
  },
  SessionEnd: {
    support: "stable",
    summary: "Stable",
    details: "Runs at session end.",
  },
  UserPromptSubmit: {
    support: "stable",
    summary: "Stable",
    details: "Runs when the user submits a prompt.",
  },
  TaskCompleted: {
    support: "conditional",
    summary: "Conditional",
    details:
      "Typically requires teammate/task orchestration flows.",
  },
  TeammateIdle: {
    support: "conditional",
    summary: "Conditional",
    details:
      "Typically requires teammate/task orchestration flows.",
  },
  Setup: {
    support: "conditional",
    summary: "Conditional",
    details:
      "Usually fires during setup/onboarding/trust initialization flows, not every regular session.",
  },
  ConfigChange: {
    support: "stable",
    summary: "Stable",
    details: "Runs when settings/config files change.",
  },
  WorktreeCreate: {
    support: "conditional",
    summary: "Conditional",
    details:
      "Requires Claude-managed worktree mode (for example, --worktree).",
  },
  WorktreeRemove: {
    support: "conditional",
    summary: "Conditional",
    details:
      "Requires a Claude-managed worktree teardown path to complete.",
  },
};

export const CONDITIONAL_EVENTS = new Set(
  Object.entries(EVENT_RUNTIME_REQUIREMENTS)
    .filter(([, meta]) => meta.support === "conditional")
    .map(([event]) => event),
);

export const EVENT_GROUPS = [
  { label: "Session", events: ["SessionStart", "SessionEnd", "Setup", "WorktreeCreate", "WorktreeRemove"] },
  { label: "User", events: ["UserPromptSubmit", "PermissionRequest"] },
  {
    label: "Tools",
    events: ["PreToolUse", "PostToolUse", "PostToolUseFailure"],
  },
  {
    label: "Agents",
    events: ["SubagentStart", "SubagentStop", "TaskCompleted", "TeammateIdle"],
  },
  { label: "Context", events: ["PreCompact"] },
  { label: "Signals", events: ["Notification", "Stop", "ConfigChange"] },
] as const;

export const TOOL_CHIPS = [
  { label: "Bash", value: "Bash" },
  { label: "Edit", value: "Edit" },
  { label: "Write", value: "Write" },
  { label: "Read", value: "Read" },
  { label: "Glob", value: "Glob" },
  { label: "Grep", value: "Grep" },
  { label: "WebFetch", value: "WebFetch" },
  { label: "WebSearch", value: "WebSearch" },
  { label: "Task", value: "Task" },
  { label: "Notebook", value: "NotebookEdit" },
  { label: "All MCP", value: "mcp__.*" },
];

/** Events that support tool matchers */
export const TOOL_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
]);

/** Frequency level for each hook event */
export type EventFrequency = "high" | "medium" | "low";

export const EVENT_FREQUENCY: Record<
  string,
  { level: EventFrequency; label: string }
> = {
  PreToolUse: { level: "high", label: "Fires every tool call" },
  PostToolUse: { level: "high", label: "Fires every tool call" },
  PostToolUseFailure: { level: "high", label: "Fires every tool call" },
  UserPromptSubmit: { level: "high", label: "Fires every message" },
  Stop: { level: "medium", label: "Fires at end of session" },
  SubagentStart: { level: "medium", label: "Fires per subagent" },
  SubagentStop: { level: "medium", label: "Fires per subagent" },
  TaskCompleted: { level: "medium", label: "Fires per task" },
  TeammateIdle: { level: "medium", label: "Fires per task" },
  PermissionRequest: { level: "medium", label: "Fires per permission" },
  Notification: { level: "low", label: "Fires occasionally" },
  PreCompact: { level: "low", label: "Fires occasionally" },
  SessionStart: { level: "low", label: "Fires once per session" },
  SessionEnd: { level: "low", label: "Fires once per session" },
  Setup: { level: "low", label: "Fires once per session" },
  ConfigChange: { level: "low", label: "Fires on config changes" },
  WorktreeCreate: { level: "low", label: "Fires on worktree creation" },
  WorktreeRemove: { level: "low", label: "Fires on worktree removal" },
};

export const HIGH_FREQ_EVENTS = new Set(
  Object.entries(EVENT_FREQUENCY)
    .filter(([, v]) => v.level === "high")
    .map(([k]) => k),
);

/** Marker used to detect if format hints were already appended */
export const FORMAT_HINT_MARKER = "<!-- hook-format -->";

/** Default timeouts in seconds, per hook type */
export const DEFAULT_TIMEOUTS: Record<HookType, number> = {
  command: 600,
  prompt: 30,
  agent: 60,
};

/** Threshold: values above this are likely legacy millisecond values */
export const LEGACY_MS_THRESHOLD = 1000;

/** Type-specific help text */
export const TYPE_DESCRIPTIONS: Record<HookType, string> = {
  command: "Run a shell command. Vars: $FILE, $TOOL_NAME, $ARGUMENTS.",
  prompt: "Run an LLM check from your prompt.",
  agent: "Run a tool-enabled LLM check for deeper validation.",
};

/** Placeholder examples per type */
export const TYPE_PLACEHOLDERS: Record<HookType, string> = {
  command: 'e.g. npx eslint --fix "$FILE"',
  prompt:
    "e.g. Verify all tests pass before stopping. Check that no failing tests exist.",
  agent:
    "e.g. Review the bash command for safety. Check for destructive operations like rm -rf or force pushes.",
};

export const EVENT_DESCRIPTIONS: Record<string, string> = {
  PreToolUse: "Before a tool is called (every tool call)",
  PostToolUse: "After a tool completes (every tool call)",
  PostToolUseFailure: "After a tool call fails (every tool call)",
  PermissionRequest: "When a permission dialog appears (per permission)",
  Notification: "When Claude sends a notification (occasional)",
  Stop: "When Claude is about to stop (end of session)",
  SubagentStart: "When a subagent is spawned (per subagent)",
  SubagentStop: "When a subagent stops (per subagent)",
  PreCompact: "Before context compaction (occasional)",
  SessionStart: "When a session starts (once per session)",
  SessionEnd: "When a session ends (once per session)",
  UserPromptSubmit: "When user submits a prompt (every message)",
  TaskCompleted: "When a task is marked completed (per task)",
  TeammateIdle: "When a teammate is about to go idle (per task)",
  Setup: "During repository initialization (once per session)",
  ConfigChange: "When a configuration file changes (per change)",
  WorktreeCreate: "When a worktree is created (per worktree)",
  WorktreeRemove: "When a worktree is removed (per worktree)",
};
