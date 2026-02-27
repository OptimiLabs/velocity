import { buildClaudeArgs, buildClaudeEnv } from "@/lib/console/claude-args";
import type { ConfigProvider } from "@/types/provider";

export type SessionEffortLevel = "low" | "medium" | "high";

export interface BuildCliLaunchConfigOpts {
  provider: ConfigProvider;
  model?: string;
  effort?: SessionEffortLevel;
  env?: Record<string, string>;
  claudeSessionId?: string;
  skipPermissions?: boolean;
}

export interface CliLaunchConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
  isClaudeSession: boolean;
}

export function normalizeModel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeEffort(
  value: unknown,
): SessionEffortLevel | undefined {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return undefined;
}

export function getCliProviderLabel(provider: ConfigProvider): string {
  if (provider === "codex") return "Codex";
  if (provider === "gemini") return "Gemini";
  return "Claude";
}

export function isCliProviderEnabled(
  settings: Record<string, unknown> | undefined,
  provider: ConfigProvider,
): boolean {
  if (provider === "claude") {
    return settings?.claudeCliEnabled !== false;
  }
  if (provider === "codex") {
    return settings?.codexCliEnabled !== false;
  }
  return settings?.geminiCliEnabled !== false;
}

export function inferProviderFromModel(
  model: string | null | undefined,
): ConfigProvider | null {
  const normalized = normalizeModel(model)?.toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("claude")) return "claude";
  if (normalized.includes("gemini")) return "gemini";
  if (
    normalized.includes("gpt") ||
    normalized.includes("o1") ||
    normalized.includes("o3") ||
    normalized.includes("o4") ||
    normalized.includes("codex")
  ) {
    return "codex";
  }
  return null;
}

export function inferProviderFromCommand(
  command: string | null | undefined,
): ConfigProvider | null {
  const normalized = command?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("codex")) return "codex";
  if (normalized.includes("gemini")) return "gemini";
  if (normalized.includes("claude")) return "claude";
  return null;
}

export function buildCliLaunchConfig(
  opts: BuildCliLaunchConfigOpts,
): CliLaunchConfig {
  if (opts.provider === "claude") {
    return {
      command: "claude",
      args: buildClaudeArgs({
        model: opts.model,
        claudeSessionId: opts.claudeSessionId,
        skipPermissions: opts.skipPermissions,
      }),
      env: buildClaudeEnv({ effort: opts.effort, env: opts.env }),
      isClaudeSession: true,
    };
  }

  if (opts.provider === "codex") {
    const args: string[] = [];
    if (opts.model) {
      args.push("--model", opts.model);
    }
    if (opts.effort) {
      args.push("-c", `model_reasoning_effort="${opts.effort}"`);
    }
    return {
      command: "codex",
      args,
      env: opts.env ? { ...opts.env } : {},
      isClaudeSession: false,
    };
  }

  // Keep Gemini launch args minimal to avoid unsupported-flag startup failures.
  return {
    command: "gemini",
    args: [],
    env: opts.env ? { ...opts.env } : {},
    isClaudeSession: false,
  };
}
