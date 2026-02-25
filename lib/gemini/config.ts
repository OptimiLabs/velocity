import fs from "fs";
import path from "path";
import { GEMINI_CONFIG } from "./paths";

export interface GeminiConfig {
  selectedAuthType?: string;
  theme?: string;
  preferredEditor?: string;
  autoAccept?: boolean;
  selectedModel?: string;
  model?: string;
  vimMode?: boolean;
  usageStatisticsEnabled?: boolean;
  checkpointing?: { enabled?: boolean };
  fileFiltering?: { respectGitIgnore?: boolean };
  chatCompression?: { contextPercentageThreshold?: number };
  tools?: { sandbox?: string };
  context?: { fileName?: string };
  mcpServers?: Record<string, unknown>;
  disabledMcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

export function readGeminiConfigFrom(filePath: string): GeminiConfig {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

export function readGeminiConfig(): GeminiConfig {
  return readGeminiConfigFrom(GEMINI_CONFIG);
}

export function writeGeminiConfigTo(
  filePath: string,
  data: GeminiConfig,
): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function writeGeminiConfig(data: GeminiConfig): void {
  writeGeminiConfigTo(GEMINI_CONFIG, data);
}
