import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { ConfigProvider } from "@/types/provider";
import {
  readSettings,
  writeSettings,
  type MCPServerConfig as ClaudeMcpConfig,
} from "@/lib/claude-settings";
import { CLAUDE_DIR } from "@/lib/claude-paths";
import {
  readCodexConfig,
  writeCodexConfig,
  type CodexMcpServer,
} from "@/lib/codex/config";
import { CODEX_HOME } from "@/lib/codex/paths";
import {
  readGeminiConfig,
  writeGeminiConfig,
  type GeminiConfig,
} from "@/lib/gemini/config";
import { GEMINI_HOME } from "@/lib/gemini/paths";

export interface ProviderMcpServerConfig {
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

export interface ProviderMcpState {
  enabled: Record<string, ProviderMcpServerConfig>;
  disabled: Record<string, ProviderMcpServerConfig>;
  supportsToggle: boolean;
}

const VALID_PROVIDERS = new Set<ConfigProvider>(["claude", "codex", "gemini"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceConfig(value: unknown): ProviderMcpServerConfig | null {
  if (!isPlainObject(value)) return null;
  return { ...value } as ProviderMcpServerConfig;
}

function coerceMap(value: unknown): Record<string, ProviderMcpServerConfig> {
  if (!isPlainObject(value)) return {};
  const out: Record<string, ProviderMcpServerConfig> = {};
  for (const [name, raw] of Object.entries(value)) {
    const config = coerceConfig(raw);
    if (!config) continue;
    out[name] = config;
  }
  return out;
}

export function parseConfigProvider(value: unknown): ConfigProvider | null {
  if (typeof value !== "string") return null;
  return VALID_PROVIDERS.has(value as ConfigProvider)
    ? (value as ConfigProvider)
    : null;
}

export function getProviderMcpCacheFile(provider: ConfigProvider): string {
  if (provider === "codex") return join(CODEX_HOME, "mcp-tools-cache.json");
  if (provider === "gemini") return join(GEMINI_HOME, "mcp-tools-cache.json");
  return join(CLAUDE_DIR, "mcp-tools-cache.json");
}

function getProviderDisabledMcpFile(provider: ConfigProvider): string | null {
  if (provider === "codex") {
    return join(CODEX_HOME, "mcp-disabled-servers.json");
  }
  if (provider === "gemini") {
    return join(GEMINI_HOME, "mcp-disabled-servers.json");
  }
  return null;
}

function readProviderDisabledMcp(
  provider: ConfigProvider,
): Record<string, ProviderMcpServerConfig> {
  const file = getProviderDisabledMcpFile(provider);
  if (!file) return {};
  try {
    return coerceMap(JSON.parse(readFileSync(file, "utf-8")));
  } catch {
    return {};
  }
}

function writeProviderDisabledMcp(
  provider: ConfigProvider,
  disabled: Record<string, ProviderMcpServerConfig>,
): void {
  const file = getProviderDisabledMcpFile(provider);
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(disabled, null, 2) + "\n", "utf-8");
}

export function readProviderMcpState(provider: ConfigProvider): ProviderMcpState {
  if (provider === "codex") {
    const config = readCodexConfig();
    const disabledSidecar = readProviderDisabledMcp(provider);
    const disabledLegacy = coerceMap(config.disabled_mcp_servers);
    const disabled =
      Object.keys(disabledSidecar).length > 0 ? disabledSidecar : disabledLegacy;
    if (
      Object.keys(disabledSidecar).length === 0 &&
      Object.keys(disabledLegacy).length > 0
    ) {
      writeProviderDisabledMcp(provider, disabledLegacy);
    }
    return {
      enabled: coerceMap(config.mcp_servers),
      disabled,
      supportsToggle: true,
    };
  }

  if (provider === "gemini") {
    const config = readGeminiConfig();
    const disabledSidecar = readProviderDisabledMcp(provider);
    const disabledLegacy = coerceMap(config.disabledMcpServers);
    const disabled =
      Object.keys(disabledSidecar).length > 0 ? disabledSidecar : disabledLegacy;
    if (
      Object.keys(disabledSidecar).length === 0 &&
      Object.keys(disabledLegacy).length > 0
    ) {
      writeProviderDisabledMcp(provider, disabledLegacy);
    }
    return {
      enabled: coerceMap(config.mcpServers),
      disabled,
      supportsToggle: true,
    };
  }

  const settings = readSettings();
  return {
    enabled: coerceMap(settings.mcpServers),
    disabled: coerceMap(settings.disabledMcpServers),
    supportsToggle: true,
  };
}

export function writeProviderMcpState(
  provider: ConfigProvider,
  state: ProviderMcpState,
): void {
  if (provider === "codex") {
    const config = readCodexConfig();
    config.mcp_servers = state.enabled as Record<string, CodexMcpServer>;
    writeCodexConfig(config);
    writeProviderDisabledMcp(provider, state.disabled);
    return;
  }

  if (provider === "gemini") {
    const config = readGeminiConfig();
    config.mcpServers = state.enabled as GeminiConfig["mcpServers"];
    writeGeminiConfig(config);
    writeProviderDisabledMcp(provider, state.disabled);
    return;
  }

  const settings = readSettings();
  settings.mcpServers = state.enabled as Record<string, ClaudeMcpConfig>;
  settings.disabledMcpServers = state.disabled as Record<string, ClaudeMcpConfig>;
  writeSettings(settings);
}
