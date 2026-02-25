import { GEMINI_CONFIG } from "./paths";
import {
  readGeminiConfigFrom,
  writeGeminiConfigTo,
  type GeminiConfig,
} from "./config";

export type GeminiSettings = GeminiConfig;

export function readGeminiSettings(): GeminiSettings {
  return readGeminiConfigFrom(GEMINI_CONFIG);
}

export function readGeminiSettingsFrom(filePath: string): GeminiSettings {
  return readGeminiConfigFrom(filePath);
}

export function writeGeminiSettings(data: GeminiSettings): void {
  writeGeminiConfigTo(GEMINI_CONFIG, data);
}

export function writeGeminiSettingsTo(
  filePath: string,
  data: GeminiSettings,
): void {
  writeGeminiConfigTo(filePath, data);
}
