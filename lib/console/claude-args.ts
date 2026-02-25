/**
 * Pure utility functions for building Claude CLI spawn arguments.
 */

/**
 * Build the `claude` CLI command arguments for spawning in a PTY.
 */
export function buildClaudeArgs(opts: {
  model?: string;
  claudeSessionId?: string;
  skipPermissions?: boolean;
}): string[] {
  const args: string[] = [];
  if (opts.model) {
    args.push("--model", opts.model);
  }
  if (opts.claudeSessionId) {
    args.push("--resume", opts.claudeSessionId);
  }
  if (opts.skipPermissions) {
    args.push("--dangerously-skip-permissions");
  }
  return args;
}

/**
 * Build env vars for the Claude process.
 * Effort level is set via CLAUDE_CODE_EFFORT_LEVEL env var.
 */
export function buildClaudeEnv(opts: {
  effort?: "low" | "medium" | "high";
  env?: Record<string, string>;
}): Record<string, string> {
  const env: Record<string, string> = {};
  if (opts.effort) {
    env.CLAUDE_CODE_EFFORT_LEVEL = opts.effort;
  }
  if (opts.env) {
    Object.assign(env, opts.env);
  }
  return env;
}

/**
 * Format a timestamp for use in group naming.
 */
export function formatGroupTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
