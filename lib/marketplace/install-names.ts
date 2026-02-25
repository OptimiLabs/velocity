export function normalizeMarketplaceInstallName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "item";
}

export function getMarketplaceInstallNameCandidates(name: string): string[] {
  const raw = name.trim();
  const sanitized = raw.replace(/[^a-zA-Z0-9-_]/g, "-");
  const normalized = normalizeMarketplaceInstallName(raw);
  return Array.from(new Set([raw, sanitized, normalized].filter(Boolean)));
}
