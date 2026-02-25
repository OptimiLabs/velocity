import type { ConfigProvider } from "@/types/provider";
import type {
  EventFrequency,
  EventRuntimeRequirement,
  HookType,
} from "@/lib/hooks/hook-editor-constants";
import {
  DEFAULT_TIMEOUTS,
  EVENT_DESCRIPTIONS,
  EVENT_FREQUENCY,
  EVENT_GROUPS,
  EVENT_RUNTIME_REQUIREMENTS,
  HIGH_FREQ_EVENTS,
  HOOK_EVENTS,
  TOOL_CHIPS,
  TOOL_EVENTS,
  TYPE_DESCRIPTIONS,
  TYPE_PLACEHOLDERS,
} from "@/lib/hooks/hook-editor-constants";

export type HookSettingsProvider = Extract<ConfigProvider, "claude" | "gemini">;
type HookGroup = { label: string; events: string[] };
type TimeoutStorageUnit = "seconds" | "milliseconds";

export interface HookProviderProfile {
  provider: HookSettingsProvider;
  providerLabel: string;
  hookEvents: string[];
  eventGroups: HookGroup[];
  eventDescriptions: Record<string, string>;
  eventRuntimeRequirements: Record<string, EventRuntimeRequirement>;
  eventFrequency: Record<string, { level: EventFrequency; label: string }>;
  highFrequencyEvents: Set<string>;
  mediumFrequencyEvents: Set<string>;
  toolEvents: Set<string>;
  matcherEvents: Set<string>;
  toolChips: { label: string; value: string }[];
  supportedTypes: HookType[];
  defaultTimeouts: Record<HookType, number>;
  timeoutStorageUnit: TimeoutStorageUnit;
  supportsAsyncCommand: boolean;
  supportsAiAssist: boolean;
  supportsTemplates: boolean;
  typeDescriptions: Record<HookType, string>;
  typePlaceholders: Record<HookType, string>;
}

const CLAUDE_MEDIUM_FREQUENCY_EVENTS = new Set([
  "Stop",
  "SubagentStart",
  "SubagentStop",
  "TaskCompleted",
  "TeammateIdle",
  "PermissionRequest",
]);

const CLAUDE_PROFILE: HookProviderProfile = {
  provider: "claude",
  providerLabel: "Claude",
  hookEvents: [...HOOK_EVENTS],
  eventGroups: EVENT_GROUPS.map((group) => ({
    label: group.label,
    events: [...group.events],
  })),
  eventDescriptions: EVENT_DESCRIPTIONS,
  eventRuntimeRequirements: EVENT_RUNTIME_REQUIREMENTS,
  eventFrequency: EVENT_FREQUENCY,
  highFrequencyEvents: HIGH_FREQ_EVENTS,
  mediumFrequencyEvents: CLAUDE_MEDIUM_FREQUENCY_EVENTS,
  toolEvents: TOOL_EVENTS,
  matcherEvents: TOOL_EVENTS,
  toolChips: TOOL_CHIPS,
  supportedTypes: ["command", "prompt", "agent"],
  defaultTimeouts: DEFAULT_TIMEOUTS,
  timeoutStorageUnit: "seconds",
  supportsAsyncCommand: true,
  supportsAiAssist: true,
  supportsTemplates: true,
  typeDescriptions: TYPE_DESCRIPTIONS,
  typePlaceholders: TYPE_PLACEHOLDERS,
};

const GEMINI_HOOK_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "BeforePrompt",
  "AfterPrompt",
  "BeforeTool",
  "AfterTool",
  "BeforeAgent",
  "AfterAgent",
] as const;

const GEMINI_EVENT_GROUPS: HookGroup[] = [
  {
    label: "Session",
    events: ["SessionStart", "SessionEnd"],
  },
  {
    label: "Prompt",
    events: ["BeforePrompt", "AfterPrompt"],
  },
  {
    label: "Tools",
    events: ["BeforeTool", "AfterTool"],
  },
  {
    label: "Agents",
    events: ["BeforeAgent", "AfterAgent"],
  },
];

const GEMINI_EVENT_DESCRIPTIONS: Record<string, string> = {
  SessionStart: "At the beginning of each Gemini session",
  SessionEnd: "When a Gemini session ends",
  BeforePrompt: "Before Gemini processes a prompt",
  AfterPrompt: "After Gemini responds to a prompt",
  BeforeTool: "Before Gemini executes a tool",
  AfterTool: "After Gemini completes a tool",
  BeforeAgent: "Before Gemini invokes an agent",
  AfterAgent: "After Gemini agent execution completes",
};

const GEMINI_EVENT_RUNTIME_REQUIREMENTS: Record<string, EventRuntimeRequirement> =
  {
    SessionStart: {
      support: "stable",
      summary: "Stable",
      details: "Runs at the beginning of each Gemini session.",
    },
    SessionEnd: {
      support: "stable",
      summary: "Stable",
      details: "Runs when a Gemini session ends.",
    },
    BeforePrompt: {
      support: "stable",
      summary: "Stable",
      details: "Runs before Gemini handles a prompt.",
    },
    AfterPrompt: {
      support: "stable",
      summary: "Stable",
      details: "Runs after Gemini responds to a prompt.",
    },
    BeforeTool: {
      support: "stable",
      summary: "Stable",
      details: "Runs before Gemini executes a tool call.",
    },
    AfterTool: {
      support: "stable",
      summary: "Stable",
      details: "Runs after Gemini completes a tool call.",
    },
    BeforeAgent: {
      support: "stable",
      summary: "Stable",
      details: "Runs before Gemini invokes an agent.",
    },
    AfterAgent: {
      support: "stable",
      summary: "Stable",
      details: "Runs after Gemini agent execution finishes.",
    },
  };

const GEMINI_EVENT_FREQUENCY: Record<
  string,
  { level: EventFrequency; label: string }
> = {
  SessionStart: { level: "low", label: "Fires once per session" },
  SessionEnd: { level: "low", label: "Fires once per session" },
  BeforePrompt: { level: "high", label: "Fires every prompt" },
  AfterPrompt: { level: "high", label: "Fires every prompt" },
  BeforeTool: { level: "high", label: "Fires every tool call" },
  AfterTool: { level: "high", label: "Fires every tool call" },
  BeforeAgent: { level: "medium", label: "Fires per agent invocation" },
  AfterAgent: { level: "medium", label: "Fires per agent invocation" },
};

const GEMINI_HIGH_FREQUENCY_EVENTS = new Set([
  "BeforePrompt",
  "AfterPrompt",
  "BeforeTool",
  "AfterTool",
]);

const GEMINI_MEDIUM_FREQUENCY_EVENTS = new Set(["BeforeAgent", "AfterAgent"]);
const GEMINI_TOOL_EVENTS = new Set(["BeforeTool", "AfterTool"]);
const GEMINI_MATCHER_EVENTS = new Set([
  "BeforePrompt",
  "AfterPrompt",
  "BeforeTool",
  "AfterTool",
  "BeforeAgent",
  "AfterAgent",
]);

const GEMINI_DEFAULT_TIMEOUTS: Record<HookType, number> = {
  command: 60,
  prompt: 60,
  agent: 60,
};

const GEMINI_TYPE_DESCRIPTIONS: Record<HookType, string> = {
  command: "Run a shell command.",
  prompt: "Prompt hooks are not supported by Gemini hooks.",
  agent: "Agent hooks are not supported by Gemini hooks.",
};

const GEMINI_TYPE_PLACEHOLDERS: Record<HookType, string> = {
  command: 'e.g. npm run lint',
  prompt: "Prompt hooks are not supported by Gemini hooks.",
  agent: "Agent hooks are not supported by Gemini hooks.",
};

const GEMINI_PROFILE: HookProviderProfile = {
  provider: "gemini",
  providerLabel: "Gemini",
  hookEvents: [...GEMINI_HOOK_EVENTS],
  eventGroups: GEMINI_EVENT_GROUPS,
  eventDescriptions: GEMINI_EVENT_DESCRIPTIONS,
  eventRuntimeRequirements: GEMINI_EVENT_RUNTIME_REQUIREMENTS,
  eventFrequency: GEMINI_EVENT_FREQUENCY,
  highFrequencyEvents: GEMINI_HIGH_FREQUENCY_EVENTS,
  mediumFrequencyEvents: GEMINI_MEDIUM_FREQUENCY_EVENTS,
  toolEvents: GEMINI_TOOL_EVENTS,
  matcherEvents: GEMINI_MATCHER_EVENTS,
  toolChips: [],
  supportedTypes: ["command"],
  defaultTimeouts: GEMINI_DEFAULT_TIMEOUTS,
  timeoutStorageUnit: "milliseconds",
  supportsAsyncCommand: false,
  supportsAiAssist: false,
  supportsTemplates: false,
  typeDescriptions: GEMINI_TYPE_DESCRIPTIONS,
  typePlaceholders: GEMINI_TYPE_PLACEHOLDERS,
};

function normalizeProvider(
  provider?: HookSettingsProvider | ConfigProvider | string | null,
): HookSettingsProvider {
  return provider === "gemini" ? "gemini" : "claude";
}

export function getHookProviderProfile(
  provider?: HookSettingsProvider | ConfigProvider | string | null,
): HookProviderProfile {
  return normalizeProvider(provider) === "gemini"
    ? GEMINI_PROFILE
    : CLAUDE_PROFILE;
}

