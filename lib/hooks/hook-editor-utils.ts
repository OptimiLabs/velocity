import type { HookConfig } from "@/components/settings/HookEditor";
import {
  DEFAULT_TIMEOUTS,
  EVENT_DESCRIPTIONS,
  FORMAT_HINT_MARKER,
  LEGACY_MS_THRESHOLD,
} from "@/lib/hooks/hook-editor-constants";
import type { HookType } from "@/lib/hooks/hook-editor-constants";

/** Convert a potentially-legacy ms timeout to seconds */
export function normalizeTimeout(
  value: number | undefined,
  hookType: HookConfig["type"],
  defaultTimeouts: Record<HookType, number> = DEFAULT_TIMEOUTS,
): number {
  if (value === undefined) return defaultTimeouts[hookType];
  // Heuristic: if value > 1000, it's likely milliseconds from old config
  if (value > LEGACY_MS_THRESHOLD) return Math.round(value / 1000);
  return value;
}

/** Format seconds into human-friendly display */
export function formatTimeout(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Append response-format instructions to a prompt/agent hook so the evaluating
 * LLM returns JSON that Claude Code can parse.
 *
 * Prompt and agent hooks must respond with: {"ok": true} or {"ok": false, "reason": "..."}
 * Without these instructions the LLM may return free-form text, which causes
 * "JSON validation failed" errors at runtime.
 */
export function appendPromptFormatHint(
  rawPrompt: string,
  hookType: "prompt" | "agent",
): string {
  // Don't double-append if already present
  if (rawPrompt.includes(FORMAT_HINT_MARKER)) return rawPrompt;

  // Inject $ARGUMENTS placeholder if missing so the LLM gets the hook context
  const hasArgs = rawPrompt.includes("$ARGUMENTS");
  const argsLine = hasArgs ? "" : "\n\nContext: $ARGUMENTS";

  const formatInstructions =
    hookType === "agent"
      ? `\n\nAfter your analysis, respond with JSON: {"ok": true} if everything looks good, or {"ok": false, "reason": "explanation"} if there is an issue.`
      : `\n\nYou are a hook evaluator. Your ENTIRE response must be a single JSON object with no other text, no markdown fences, no explanation. Respond: {"ok": true} or {"ok": false, "reason": "explanation"}`;

  return `${rawPrompt}${argsLine}${formatInstructions} ${FORMAT_HINT_MARKER}`;
}

/** Strip auto-appended format hints so the user sees only their original text */
export function stripPromptFormatHint(raw: string): string {
  const markerIdx = raw.indexOf(FORMAT_HINT_MARKER);
  if (markerIdx === -1) return raw;
  const trimmed = raw
    .slice(0, markerIdx)
    .replace(/\n\nContext: \$ARGUMENTS/, "");
  return trimmed.replace(
    /\n\nYou MUST respond with (?:ONLY valid )?JSON:[\s\S]*$/,
    "",
  );
}

export function describeEditingHook(
  event: string,
  hook: HookConfig,
  matcher?: string,
  eventDescriptions: Record<string, string> = EVENT_DESCRIPTIONS,
): string {
  const eventDesc = eventDescriptions[event] ?? event;
  const matcherPart = matcher ? ` on ${matcher}` : "";
  if (hook.type === "command") {
    const cmd = hook.command?.split(/\s/)[0]?.split("/").pop() ?? "command";
    return `${eventDesc}${matcherPart}: runs ${cmd}`;
  }
  if (hook.type === "prompt") {
    const snippet = hook.prompt?.slice(0, 50)?.replace(/\n/g, " ") ?? "";
    return `${eventDesc}${matcherPart}: "${snippet}..."`;
  }
  return `${eventDesc}${matcherPart}`;
}
