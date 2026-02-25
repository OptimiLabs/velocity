export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const HIGH_FREQ_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "UserPromptSubmit",
]);
const MEDIUM_FREQ_EVENTS = new Set([
  "Stop",
  "SubagentStart",
  "SubagentStop",
  "TaskCompleted",
  "TeammateIdle",
  "PermissionRequest",
]);
const TOOL_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
]);
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
  matcher?: string;
  timeout?: number;
  async?: boolean;
}

export function validateHookConfig(
  event: string,
  hook: HookInput,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Required fields
  if (hook.type === "command" && !hook.command) {
    errors.push("Command hooks require a 'command' field.");
  }
  if ((hook.type === "prompt" || hook.type === "agent") && !hook.prompt) {
    errors.push(`${hook.type} hooks require a 'prompt' field.`);
  }

  // 2. Agent on high-frequency = hard error
  if (hook.type === "agent" && HIGH_FREQ_EVENTS.has(event)) {
    errors.push(
      `Agent hooks are too slow (~30-60s) for ${event}, which fires on every tool call. Use 'prompt' type instead.`,
    );
  }

  // 3. Agent on medium-frequency = warning
  if (hook.type === "agent" && MEDIUM_FREQ_EVENTS.has(event)) {
    warnings.push(
      `Agent hooks add 30-60s latency. On ${event}, consider 'prompt' type unless file access is essential.`,
    );
  }

  // 4. Missing matcher on tool events
  if (TOOL_EVENTS.has(event) && !hook.matcher) {
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
  if (hook.command?.includes("$FILE") && hook.matcher) {
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
    hook.matcher &&
    !hook.matcher.includes("Bash")
  ) {
    errors.push(
      "$COMMAND is only available on Bash tool events. Add 'Bash' to the matcher.",
    );
  }

  // 7. Regex validation
  if (hook.matcher && typeof hook.matcher === "string") {
    try {
      new RegExp(hook.matcher);
    } catch {
      errors.push(`Invalid regex in matcher: '${hook.matcher}'`);
    }
  }

  // 8. Timeout sanity
  if (hook.timeout) {
    if (HIGH_FREQ_EVENTS.has(event) && hook.timeout > 15) {
      warnings.push(
        `Timeout of ${hook.timeout}s on ${event} (fires every tool call) — sessions will feel slow. Recommended: ≤15s.`,
      );
    } else if (MEDIUM_FREQ_EVENTS.has(event) && hook.timeout > 30) {
      warnings.push(
        `Timeout of ${hook.timeout}s on ${event} — consider ≤30s for medium-frequency events.`,
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
