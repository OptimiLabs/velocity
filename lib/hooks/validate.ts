import { getHookProviderProfile, type HookSettingsProvider } from "@/lib/hooks/provider-profile";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const FILE_TOOLS = new Set([
  "Edit",
  "Write",
  "Read",
  "Glob",
  "Grep",
  "NotebookEdit",
]);

interface HookInput {
  type: string;
  command?: string;
  prompt?: string;
  matcher?: string | Record<string, unknown>;
  timeout?: number;
  async?: boolean;
}

interface ValidateHookOptions {
  provider?: HookSettingsProvider;
  timeoutUnit?: "seconds" | "milliseconds";
}

function normalizeTimeoutToSeconds(
  timeout: number | undefined,
  options: ValidateHookOptions,
): number | null {
  if (typeof timeout !== "number" || !Number.isFinite(timeout)) return null;
  if (options.timeoutUnit === "milliseconds") return timeout / 1000;
  return timeout;
}

export function validateHookConfig(
  event: string,
  hook: HookInput,
  options: ValidateHookOptions = {},
): ValidationResult {
  const provider = options.provider ?? "claude";
  const profile = getHookProviderProfile(provider);
  const errors: string[] = [];
  const warnings: string[] = [];

  // 0. Event/type support per provider
  if (!profile.hookEvents.includes(event)) {
    errors.push(`Invalid hook event for ${profile.providerLabel}: ${event}`);
  }
  if (!profile.supportedTypes.includes(hook.type as "command" | "prompt" | "agent")) {
    errors.push(
      `Hook type '${hook.type}' is not supported for ${profile.providerLabel}. Supported: ${profile.supportedTypes.join(", ")}`,
    );
  }

  // 1. Required fields
  if (hook.type === "command" && !hook.command?.trim()) {
    errors.push("Command hooks require a 'command' field.");
  }
  if ((hook.type === "prompt" || hook.type === "agent") && !hook.prompt?.trim()) {
    errors.push(`${hook.type} hooks require a 'prompt' field.`);
  }

  const highFrequencyEvents = profile.highFrequencyEvents;
  const mediumFrequencyEvents = profile.mediumFrequencyEvents;
  const toolEvents = profile.toolEvents;

  // Provider-specific validations
  if (profile.provider === "claude") {
    // 2. Agent on high-frequency = hard error
    if (hook.type === "agent" && highFrequencyEvents.has(event)) {
      errors.push(
        `Agent hooks are too slow (~30-60s) for ${event}, which fires on every tool call. Use 'prompt' type instead.`,
      );
    }

    // 3. Agent on medium-frequency = warning
    if (hook.type === "agent" && mediumFrequencyEvents.has(event)) {
      warnings.push(
        `Agent hooks add 30-60s latency. On ${event}, consider 'prompt' type unless file access is essential.`,
      );
    }

    // 4. Missing matcher on tool events
    if (toolEvents.has(event) && !hook.matcher) {
      if (hook.type === "prompt" || hook.type === "agent") {
        warnings.push(
          "No matcher — this hook fires on every tool call (Bash, Read, Edit, Grep...). Add a matcher to target specific tools.",
        );
      } else if (hook.type === "command") {
        warnings.push(
          "No matcher — this command runs on every tool call. Consider adding a matcher like 'Edit|Write'.",
        );
      }
    }

    // 5. $FILE on non-file tools
    if (hook.command?.includes("$FILE") && typeof hook.matcher === "string") {
      const matcherTools = hook.matcher.split("|");
      const hasNonFileTools = matcherTools.some((t) => !FILE_TOOLS.has(t));
      const hasFileTools = matcherTools.some((t) => FILE_TOOLS.has(t));
      if (hasNonFileTools && !hasFileTools) {
        errors.push(
          `$FILE is empty for tools like ${matcherTools.filter((t) => !FILE_TOOLS.has(t)).join(", ")}. ` +
            `Only file tools (Edit, Write, Read, Glob, Grep) provide $FILE. Change matcher to target file tools.`,
        );
      } else if (hasNonFileTools) {
        warnings.push(
          `$FILE is empty for ${matcherTools.filter((t) => !FILE_TOOLS.has(t)).join(", ")} — only file tools provide it.`,
        );
      }
    }

    // 6. $COMMAND without Bash
    if (
      hook.command?.includes("$COMMAND") &&
      typeof hook.matcher === "string" &&
      hook.matcher &&
      !hook.matcher.includes("Bash")
    ) {
      errors.push(
        "$COMMAND is only available on Bash tool events. Add 'Bash' to the matcher.",
      );
    }

    // 7. Regex validation (Claude matcher is regex)
    if (hook.matcher && typeof hook.matcher === "string") {
      try {
        new RegExp(hook.matcher);
      } catch {
        errors.push(`Invalid regex in matcher: '${hook.matcher}'`);
      }
    }
  } else {
    // Gemini hooks support command hooks only. Ignore Claude-specific matcher semantics.
    if (hook.async) {
      warnings.push(
        "Gemini hooks do not document async command execution. This flag may be ignored.",
      );
    }
    if (
      hook.matcher &&
      typeof hook.matcher !== "string" &&
      !(
        typeof hook.matcher === "object" &&
        hook.matcher !== null &&
        !Array.isArray(hook.matcher)
      )
    ) {
      errors.push(
        "Gemini matcher must be a string or object.",
      );
    }
  }

  // 8. Timeout sanity
  const timeoutSeconds = normalizeTimeoutToSeconds(hook.timeout, options);
  if (timeoutSeconds !== null) {
    if (timeoutSeconds <= 0) {
      errors.push("Timeout must be greater than 0.");
    } else if (profile.provider === "claude" && highFrequencyEvents.has(event) && timeoutSeconds > 15) {
      warnings.push(
        `Timeout of ${Math.round(timeoutSeconds)}s on ${event} (fires every tool call) — sessions will feel slow. Recommended: ≤15s.`,
      );
    } else if (
      profile.provider === "claude" &&
      mediumFrequencyEvents.has(event) &&
      timeoutSeconds > 30
    ) {
      warnings.push(
        `Timeout of ${Math.round(timeoutSeconds)}s on ${event} — consider ≤30s for medium-frequency events.`,
      );
    } else if (profile.provider === "gemini" && timeoutSeconds > 120) {
      warnings.push(
        `Timeout of ${Math.round(timeoutSeconds)}s is high for Gemini hooks and may slow prompts/tools noticeably.`,
      );
    }
  }

  // 9. Runtime-conditional events (observable only in specific CLI/runtime flows)
  const runtimeMeta = profile.eventRuntimeRequirements[event];
  if (runtimeMeta?.support === "conditional") {
    warnings.push(`${event} is conditional: ${runtimeMeta.details}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
