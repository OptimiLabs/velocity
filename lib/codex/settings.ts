import { readToml, writeToml } from "./toml";
import { CODEX_CONFIG } from "./paths";
import type { CodexConfig } from "./config";

export type CodexSettings = CodexConfig;

export function readCodexSettings(): CodexSettings {
  return readToml<CodexSettings>(CODEX_CONFIG);
}

export function readCodexSettingsFrom(filePath: string): CodexSettings {
  return readToml<CodexSettings>(filePath);
}

export function writeCodexSettings(data: CodexSettings): void {
  writeToml(CODEX_CONFIG, data);
}

export function writeCodexSettingsTo(
  filePath: string,
  data: CodexSettings,
): void {
  writeToml(filePath, data);
}
