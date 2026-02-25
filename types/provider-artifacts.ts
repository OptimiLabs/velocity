import type { ConfigProvider } from "@/types/provider";

export type ArtifactType =
  | "agent"
  | "skill"
  | "hook"
  | "instruction"
  | "workflow";
export type ProviderTarget = ConfigProvider;
export type ProviderTargetMode = ProviderTarget | "all";

export interface ArtifactConversionIssue {
  level: "warning" | "error";
  message: string;
}

export interface ArtifactConversionResult<TData = unknown> {
  target: ProviderTarget;
  saveSupported: boolean;
  supported: boolean;
  output: TData | null;
  previewText?: string;
  fileName?: string;
  filePath?: string;
  issues: ArtifactConversionIssue[];
  saved?: boolean;
}

export interface MultiTargetResponse<TSingle = unknown, TResult = unknown> {
  targetProvider: ProviderTargetMode;
  primary: TSingle;
  results: ArtifactConversionResult<TResult>[];
}

export function normalizeProviderTargets(
  mode: ProviderTargetMode | ProviderTarget[] | undefined,
): ProviderTarget[] {
  if (!mode || mode === "all") return ["claude", "codex", "gemini"];
  if (Array.isArray(mode)) {
    const valid = mode.filter(
      (p): p is ProviderTarget =>
        p === "claude" || p === "codex" || p === "gemini",
    );
    return [...new Set(valid)];
  }
  return [mode];
}
