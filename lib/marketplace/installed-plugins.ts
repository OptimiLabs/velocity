import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { CLAUDE_DIR } from "@/lib/claude-paths";
import {
  getMarketplaceInstallNameCandidates,
  normalizeMarketplaceInstallName,
} from "@/lib/marketplace/install-names";
import type { ConfigProvider } from "@/types/provider";

export const INSTALLED_PLUGINS_PATH = join(
  CLAUDE_DIR,
  "plugins",
  "installed_plugins.json",
);

const VALID_PROVIDERS = new Set<ConfigProvider>(["claude", "codex", "gemini"]);

export interface MarketplaceInstalledPluginRecord {
  name?: string;
  targetProvider?: ConfigProvider;
  marketplaceRepo?: string;
  agents: string[];
  skills: string[];
  commands: string[];
  mcpServers: string[];
  installedAt?: string;
  disabled: boolean;
  [key: string]: unknown;
}

interface InstalledPluginsFile {
  raw: Record<string, unknown>;
  plugins: Record<string, unknown>;
}

interface FindMarketplacePluginInput {
  name: string;
  targetProvider: ConfigProvider;
  marketplaceRepo?: string;
}

type MarketplaceTrackedComponentType =
  | "agent"
  | "skill"
  | "command"
  | "mcp-server";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConfigProvider(value: unknown): value is ConfigProvider {
  return typeof value === "string" && VALID_PROVIDERS.has(value as ConfigProvider);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function isMarketplacePluginRecord(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.marketplaceRepo === "string" ||
    isConfigProvider(value.targetProvider) ||
    Array.isArray(value.agents) ||
    Array.isArray(value.skills) ||
    Array.isArray(value.commands) ||
    Array.isArray(value.mcpServers)
  );
}

function normalizeRecord(
  value: Record<string, unknown>,
): MarketplaceInstalledPluginRecord {
  return {
    ...value,
    name: typeof value.name === "string" ? value.name : undefined,
    targetProvider: isConfigProvider(value.targetProvider)
      ? value.targetProvider
      : undefined,
    marketplaceRepo:
      typeof value.marketplaceRepo === "string" ? value.marketplaceRepo : undefined,
    agents: toStringArray(value.agents),
    skills: toStringArray(value.skills),
    commands: toStringArray(value.commands),
    mcpServers: toStringArray(value.mcpServers),
    installedAt: typeof value.installedAt === "string" ? value.installedAt : undefined,
    disabled: value.disabled === true,
  };
}

function readInstalledPluginsFile(): InstalledPluginsFile {
  if (!existsSync(INSTALLED_PLUGINS_PATH)) {
    return { raw: {}, plugins: {} };
  }

  try {
    const parsed = JSON.parse(readFileSync(INSTALLED_PLUGINS_PATH, "utf-8"));
    if (!isPlainObject(parsed)) {
      return { raw: {}, plugins: {} };
    }
    const plugins = isPlainObject(parsed.plugins)
      ? { ...(parsed.plugins as Record<string, unknown>) }
      : {};
    return { raw: parsed, plugins };
  } catch {
    return { raw: {}, plugins: {} };
  }
}

function writeInstalledPluginsFile(file: InstalledPluginsFile): void {
  const next = {
    ...file.raw,
    plugins: file.plugins,
  };
  mkdirSync(dirname(INSTALLED_PLUGINS_PATH), { recursive: true });
  writeFileSync(
    INSTALLED_PLUGINS_PATH,
    JSON.stringify(next, null, 2) + "\n",
    "utf-8",
  );
}

function inferProviderFromKey(key: string): ConfigProvider | undefined {
  const prefix = key.split(":", 1)[0];
  if (!prefix || !VALID_PROVIDERS.has(prefix as ConfigProvider)) {
    return undefined;
  }
  return prefix as ConfigProvider;
}

function normalizeRepoMatch(value: string | undefined): {
  full: string | null;
  name: string | null;
} {
  if (!value) return { full: null, name: null };
  const normalized = value.trim().toLowerCase();
  if (!normalized) return { full: null, name: null };
  const repoName = normalized.split("/").pop() || normalized;
  return { full: normalized, name: repoName };
}

function repoMatchesFilter(
  key: string,
  recordRepo: string | undefined,
  requestedRepo: string | undefined,
): boolean {
  if (!requestedRepo) return true;
  const requested = normalizeRepoMatch(requestedRepo);
  const fromRecord = normalizeRepoMatch(recordRepo);
  const keyRepo = normalizeRepoMatch(key.split("@").slice(1).join("@"));

  if (fromRecord.full) {
    return (
      fromRecord.full === requested.full ||
      fromRecord.name === requested.name
    );
  }
  if (keyRepo.full) {
    return keyRepo.full === requested.full || keyRepo.name === requested.name;
  }
  return false;
}

function normalizeTrackedComponentName(
  type: MarketplaceTrackedComponentType,
  value: string,
): string {
  if (type === "agent") {
    return normalizeMarketplaceInstallName(value.replace(/\.md$/i, ""));
  }
  if (type === "mcp-server") {
    return normalizeMarketplaceInstallName(value.trim());
  }
  return normalizeMarketplaceInstallName(value.replace(/\.md$/i, ""));
}

function findMarketplacePluginEntryInMap(
  plugins: Record<string, unknown>,
  input: FindMarketplacePluginInput,
): { key: string; record: MarketplaceInstalledPluginRecord } | null {
  const requestedRepo = input.marketplaceRepo?.trim().toLowerCase();
  const requestedRepoName = requestedRepo?.split("/").pop();
  const nameCandidates = getMarketplaceInstallNameCandidates(input.name);
  const normalizedCandidates = new Set(
    nameCandidates.map((candidate) => normalizeMarketplaceInstallName(candidate)),
  );
  const targetNameNormalized = normalizeMarketplaceInstallName(input.name);

  let best:
    | { key: string; record: MarketplaceInstalledPluginRecord; score: number }
    | null = null;

  for (const [key, rawValue] of Object.entries(plugins)) {
    if (!isMarketplacePluginRecord(rawValue)) continue;
    const record = normalizeRecord(rawValue);
    const inferredProvider = record.targetProvider || inferProviderFromKey(key);
    if (inferredProvider && inferredProvider !== input.targetProvider) continue;

    const recordNameNormalized = record.name
      ? normalizeMarketplaceInstallName(record.name)
      : "";
    const keyMatchesName =
      nameCandidates.some(
        (candidate) =>
          key.startsWith(`${input.targetProvider}:${candidate}@`) ||
          key.startsWith(`${candidate}@`),
      ) ||
      Array.from(normalizedCandidates).some(
        (candidate) =>
          key.startsWith(`${input.targetProvider}:${candidate}@`) ||
          key.startsWith(`${candidate}@`),
      );
    const recordMatchesName =
      !!recordNameNormalized &&
      (normalizedCandidates.has(recordNameNormalized) ||
        recordNameNormalized === targetNameNormalized);
    if (!keyMatchesName && !recordMatchesName) continue;

    const recordRepo = record.marketplaceRepo?.trim().toLowerCase();
    const keyRepo = key.split("@").slice(1).join("@").toLowerCase();
    const repoNameMatchesKey = !!requestedRepoName && keyRepo === requestedRepoName;

    if (requestedRepo) {
      if (recordRepo) {
        if (recordRepo !== requestedRepo) continue;
      } else if (!repoNameMatchesKey) {
        continue;
      }
    }

    let score = 0;
    if (recordRepo && requestedRepo && recordRepo === requestedRepo) score += 6;
    if (repoNameMatchesKey) score += 2;
    if (key.startsWith(`${input.targetProvider}:`)) score += 2;
    if (recordNameNormalized === targetNameNormalized) score += 2;
    if (recordMatchesName) score += 1;
    if (keyMatchesName) score += 1;

    if (!best || score > best.score) {
      best = { key, record, score };
    }
  }

  if (!best) return null;
  return { key: best.key, record: best.record };
}

export function getInstalledPluginsRegistry(): Record<string, unknown> {
  return readInstalledPluginsFile().plugins;
}

export function findMarketplacePluginEntry(
  input: FindMarketplacePluginInput,
): { key: string; record: MarketplaceInstalledPluginRecord } | null {
  const file = readInstalledPluginsFile();
  return findMarketplacePluginEntryInMap(file.plugins, input);
}

export function getMarketplacePluginInstallState(
  input: FindMarketplacePluginInput,
): { installed: boolean; disabled: boolean } {
  const found = findMarketplacePluginEntry(input);
  if (!found) return { installed: false, disabled: false };
  return { installed: true, disabled: found.record.disabled === true };
}

export function upsertMarketplacePluginEntry(params: {
  name: string;
  targetProvider: ConfigProvider;
  marketplaceRepo: string;
  agents?: string[];
  skills?: string[];
  commands?: string[];
  mcpServers?: string[];
  disabled?: boolean;
}): string {
  const file = readInstalledPluginsFile();
  const marketplaceRepoName = params.marketplaceRepo.split("/").pop() || "";
  const key = `${params.targetProvider}:${params.name}@${marketplaceRepoName}`;
  const existing = isPlainObject(file.plugins[key]) ? file.plugins[key] : {};
  const merged: Record<string, unknown> = {
    ...existing,
    name: params.name,
    targetProvider: params.targetProvider,
    marketplaceRepo: params.marketplaceRepo,
    agents: Array.from(new Set(params.agents || [])),
    skills: Array.from(new Set(params.skills || [])),
    commands: Array.from(new Set(params.commands || [])),
    mcpServers: Array.from(new Set(params.mcpServers || [])),
    installedAt: new Date().toISOString(),
    disabled: params.disabled === true,
  };
  file.plugins[key] = merged;
  writeInstalledPluginsFile(file);
  return key;
}

export function setMarketplacePluginEntryDisabled(
  input: FindMarketplacePluginInput & { disabled: boolean },
): boolean {
  const file = readInstalledPluginsFile();
  const found = findMarketplacePluginEntryInMap(file.plugins, input);
  if (!found) return false;
  const current = isPlainObject(file.plugins[found.key])
    ? (file.plugins[found.key] as Record<string, unknown>)
    : {};
  file.plugins[found.key] = {
    ...current,
    disabled: input.disabled,
  };
  writeInstalledPluginsFile(file);
  return true;
}

export function removeMarketplacePluginEntry(
  input: FindMarketplacePluginInput,
): boolean {
  const file = readInstalledPluginsFile();
  const found = findMarketplacePluginEntryInMap(file.plugins, input);
  if (!found) return false;
  delete file.plugins[found.key];
  writeInstalledPluginsFile(file);
  return true;
}

export function removeMarketplacePluginComponentReferences(input: {
  targetProvider: ConfigProvider;
  componentType: MarketplaceTrackedComponentType;
  name: string;
  marketplaceRepo?: string;
}): { updatedEntries: number; removedEntries: number } {
  const file = readInstalledPluginsFile();
  const requestedCandidates = getMarketplaceInstallNameCandidates(input.name);
  const candidateSet = new Set<string>(
    requestedCandidates.map((candidate) =>
      normalizeTrackedComponentName(input.componentType, candidate),
    ),
  );

  let updatedEntries = 0;
  let removedEntries = 0;
  let changed = false;

  for (const [key, rawValue] of Object.entries(file.plugins)) {
    if (!isMarketplacePluginRecord(rawValue)) continue;
    const normalized = normalizeRecord(rawValue);
    const inferredProvider = normalized.targetProvider || inferProviderFromKey(key);
    if (inferredProvider && inferredProvider !== input.targetProvider) continue;
    if (
      !repoMatchesFilter(key, normalized.marketplaceRepo, input.marketplaceRepo)
    ) {
      continue;
    }

    const nextRecord = {
      ...normalized,
      agents: [...normalized.agents],
      skills: [...normalized.skills],
      commands: [...normalized.commands],
      mcpServers: [...normalized.mcpServers],
    };
    const previousCounts = {
      agents: nextRecord.agents.length,
      skills: nextRecord.skills.length,
      commands: nextRecord.commands.length,
      mcpServers: nextRecord.mcpServers.length,
    };

    if (input.componentType === "agent") {
      nextRecord.agents = nextRecord.agents.filter(
        (entry) =>
          !candidateSet.has(normalizeTrackedComponentName("agent", entry)),
      );
    } else if (input.componentType === "skill") {
      nextRecord.skills = nextRecord.skills.filter(
        (entry) =>
          !candidateSet.has(normalizeTrackedComponentName("skill", entry)),
      );
    } else if (input.componentType === "command") {
      nextRecord.commands = nextRecord.commands.filter(
        (entry) =>
          !candidateSet.has(normalizeTrackedComponentName("command", entry)),
      );
    } else {
      nextRecord.mcpServers = nextRecord.mcpServers.filter(
        (entry) =>
          !candidateSet.has(normalizeTrackedComponentName("mcp-server", entry)),
      );
    }

    const changedCounts =
      previousCounts.agents !== nextRecord.agents.length ||
      previousCounts.skills !== nextRecord.skills.length ||
      previousCounts.commands !== nextRecord.commands.length ||
      previousCounts.mcpServers !== nextRecord.mcpServers.length;
    if (!changedCounts) continue;

    changed = true;
    const hasComponents =
      nextRecord.agents.length > 0 ||
      nextRecord.skills.length > 0 ||
      nextRecord.commands.length > 0 ||
      nextRecord.mcpServers.length > 0;

    if (!hasComponents) {
      delete file.plugins[key];
      removedEntries += 1;
      continue;
    }

    file.plugins[key] = {
      ...(rawValue as Record<string, unknown>),
      agents: nextRecord.agents,
      skills: nextRecord.skills,
      commands: nextRecord.commands,
      mcpServers: nextRecord.mcpServers,
    };
    updatedEntries += 1;
  }

  if (changed) {
    writeInstalledPluginsFile(file);
  }

  return { updatedEntries, removedEntries };
}
