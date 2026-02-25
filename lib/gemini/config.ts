import fs from "fs";
import path from "path";
import { GEMINI_CONFIG } from "./paths";

export interface GeminiModelConfig {
  name?: string;
  maxSessionTurns?: number;
  summarizeToolOutput?: Record<string, unknown>;
  compressionThreshold?: number;
  disableLoopDetection?: boolean;
  skipNextSpeakerCheck?: boolean;
  [key: string]: unknown;
}

export interface GeminiConfig {
  selectedAuthType?: string;
  theme?: string;
  preferredEditor?: string;
  autoAccept?: boolean;
  sandbox?: boolean;
  yolo?: boolean;
  telemetry?: boolean;
  selectedModel?: string;
  model?: GeminiModelConfig | string;
  vimMode?: boolean;
  usageStatisticsEnabled?: boolean;
  checkpointing?: { enabled?: boolean };
  contextFileName?: string;
  mcpServerCommand?: string;
  mcpServerArgs?: string[];
  fileFiltering?: { respectGitIgnore?: boolean };
  chatCompression?: { contextPercentageThreshold?: number };
  tools?: { sandbox?: string };
  context?: { fileName?: string };
  accessibility?: { disableLoadingPhrases?: boolean };
  mcpServers?: Record<string, unknown>;
  disabledMcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

export const DEFAULT_GEMINI_CONTEXT_FILE_NAME = "GEMINI.md";

function normalizeModelSetting(
  model: GeminiConfig["model"],
): GeminiModelConfig | undefined {
  if (typeof model === "string") {
    const trimmed = model.trim();
    return trimmed ? { name: trimmed } : undefined;
  }

  if (model && typeof model === "object" && !Array.isArray(model)) {
    return { ...model };
  }

  return undefined;
}

function normalizeContextFileName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function resolveGeminiContextFileName(
  data?: GeminiConfig | null,
): string {
  const topLevel = normalizeContextFileName(data?.contextFileName);
  if (topLevel) return topLevel;

  const nested =
    data?.context && typeof data.context === "object"
      ? normalizeContextFileName(
          (data.context as { fileName?: unknown }).fileName,
        )
      : "";
  if (nested) return nested;

  return DEFAULT_GEMINI_CONTEXT_FILE_NAME;
}

export function normalizeGeminiConfig(data: GeminiConfig): GeminiConfig {
  const next: GeminiConfig = { ...data };
  const model = normalizeModelSetting(next.model);
  if (model) {
    next.model = model;
  } else {
    delete next.model;
  }
  return next;
}

export function readGeminiConfigFrom(filePath: string): GeminiConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as GeminiConfig;
    return normalizeGeminiConfig(parsed);
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
  const normalized = normalizeGeminiConfig(data);
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2) + "\n", "utf-8");
}

export function writeGeminiConfig(data: GeminiConfig): void {
  writeGeminiConfigTo(GEMINI_CONFIG, data);
}
