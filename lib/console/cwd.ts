export const DEFAULT_CONSOLE_CWD = ".";

export function resolveConsoleCwd(
  ...candidates: Array<string | null | undefined>
): string {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    return trimmed;
  }
  return DEFAULT_CONSOLE_CWD;
}
