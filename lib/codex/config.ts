import { readToml, writeToml } from "./toml";
import { CODEX_CONFIG } from "./paths";

export interface CodexMcpServer {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface CodexAgentRoleConfig {
  /** Path to a role config TOML file. */
  config_file?: string;
  description?: string;
  prompt?: string;
  model?: string;
  model_provider?: string;
  model_reasoning_effort?: "low" | "medium" | "high" | "xhigh";
  approval_policy?: "untrusted" | "on-request" | "never";
  sandbox_mode?: "read-only" | "workspace-write" | "danger-full-access";
}

export interface CodexConfig {
  model?: string;
  /** @deprecated Use approval_policy instead. Kept for backward compatibility with older configs. */
  approval_mode?: "suggest" | "auto-edit" | "full-auto";
  approval_policy?: "untrusted" | "on-request" | "never";
  model_provider?: string;
  local_provider?: "ollama" | "lmstudio";
  sandbox_mode?: "read-only" | "workspace-write" | "danger-full-access";
  web_search?: "enabled" | "cached" | "disabled";
  model_reasoning_effort?: "low" | "medium" | "high" | "xhigh";
  personality?: string;
  model_instructions_file?: string;
  model_context_window?: number;
  providers?: Record<string, { api_key?: string; base_url?: string }>;
  sandbox?: { enable?: boolean };
  mcp_servers?: Record<string, CodexMcpServer>;
  disabled_mcp_servers?: Record<string, CodexMcpServer>;
  agents?: Record<string, CodexAgentRoleConfig>;
  features?: Record<string, boolean>;
  projects?: Record<
    string,
    {
      trust_level?: "trusted" | "untrusted";
    }
  >;
  shell_environment_policy?: string;
  history?: {
    max_entries?: number;
    persistence?: "save-all" | "none";
  };
  [key: string]: unknown;
}

export function readCodexConfig(): CodexConfig {
  return readToml<CodexConfig>(CODEX_CONFIG);
}

export function readCodexConfigFrom(filePath: string): CodexConfig {
  return readToml<CodexConfig>(filePath);
}

export function writeCodexConfig(data: CodexConfig): void {
  writeToml(CODEX_CONFIG, data);
}
