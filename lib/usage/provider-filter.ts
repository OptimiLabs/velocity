import type { ConfigProvider } from "@/types/provider";

export const USAGE_PROVIDER_STORAGE_KEY = "usage-provider-filter";

export function parseUsageProvider(value: string | null): ConfigProvider | null {
  if (value === "claude" || value === "codex" || value === "gemini") {
    return value;
  }
  return null;
}
