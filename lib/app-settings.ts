import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { CLAUDE_DIR } from "./claude-paths";
import { readSettings } from "./claude-settings";

export const APP_SETTINGS_FILE = join(CLAUDE_DIR, "velocity-settings.json");

export type GenerationRuntimeMode = "claude-cli" | "codex-cli" | "api";
export type ThinkingLevel = "low" | "medium" | "high";

export interface RuntimeGenerationDefaults {
  model?: string;
  thinkingLevel?: ThinkingLevel;
}

export interface AppSettings {
  autoArchiveDays?: number;
  disableHeaderView?: boolean;
  sessionAutoLoadAll?: boolean;
  orphanTimeoutMs?: number;
  generationRuntime?: GenerationRuntimeMode;
  generationModel?: string;
  generationThinkingLevel?: ThinkingLevel;
  generationDefaults?: Partial<Record<GenerationRuntimeMode, RuntimeGenerationDefaults>>;
  codexCliEnabled?: boolean;
  geminiCliEnabled?: boolean;
  [key: string]: unknown;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return value === "low" || value === "medium" || value === "high";
}

function coerceRuntimeDefaults(
  raw: unknown,
): Partial<Record<GenerationRuntimeMode, RuntimeGenerationDefaults>> | undefined {
  if (!isObjectRecord(raw)) return undefined;
  const result: Partial<Record<GenerationRuntimeMode, RuntimeGenerationDefaults>> =
    {};

  for (const mode of ["claude-cli", "codex-cli", "api"] as const) {
    const value = raw[mode];
    if (!isObjectRecord(value)) continue;

    const model =
      typeof value.model === "string" && value.model.trim().length > 0
        ? value.model.trim()
        : undefined;
    const thinkingLevel = isThinkingLevel(value.thinkingLevel)
      ? value.thinkingLevel
      : undefined;

    if (model || thinkingLevel) {
      result[mode] = {
        ...(model ? { model } : {}),
        ...(thinkingLevel ? { thinkingLevel } : {}),
      };
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function coerceAppSettings(raw: unknown): AppSettings {
  if (!isObjectRecord(raw)) return {};
  const next: AppSettings = { ...raw };

  if (typeof raw.autoArchiveDays === "number" && Number.isFinite(raw.autoArchiveDays)) {
    next.autoArchiveDays = raw.autoArchiveDays;
  } else {
    delete next.autoArchiveDays;
  }
  if (typeof raw.disableHeaderView === "boolean") {
    next.disableHeaderView = raw.disableHeaderView;
  } else {
    delete next.disableHeaderView;
  }
  if (typeof raw.sessionAutoLoadAll === "boolean") {
    next.sessionAutoLoadAll = raw.sessionAutoLoadAll;
  } else {
    delete next.sessionAutoLoadAll;
  }
  if (typeof raw.orphanTimeoutMs === "number" && Number.isFinite(raw.orphanTimeoutMs)) {
    next.orphanTimeoutMs = raw.orphanTimeoutMs;
  } else {
    delete next.orphanTimeoutMs;
  }
  if (
    raw.generationRuntime === "claude-cli" ||
    raw.generationRuntime === "codex-cli" ||
    raw.generationRuntime === "api"
  ) {
    next.generationRuntime = raw.generationRuntime;
  } else {
    delete next.generationRuntime;
  }
  if (
    typeof raw.generationModel === "string" &&
    raw.generationModel.trim().length > 0
  ) {
    next.generationModel = raw.generationModel.trim();
  } else {
    delete next.generationModel;
  }
  if (isThinkingLevel(raw.generationThinkingLevel)) {
    next.generationThinkingLevel = raw.generationThinkingLevel;
  } else {
    delete next.generationThinkingLevel;
  }
  const runtimeDefaults = coerceRuntimeDefaults(raw.generationDefaults);
  if (runtimeDefaults) {
    next.generationDefaults = runtimeDefaults;
  } else {
    delete next.generationDefaults;
  }
  if (typeof raw.codexCliEnabled === "boolean") {
    next.codexCliEnabled = raw.codexCliEnabled;
  } else {
    delete next.codexCliEnabled;
  }
  if (typeof raw.geminiCliEnabled === "boolean") {
    next.geminiCliEnabled = raw.geminiCliEnabled;
  } else {
    delete next.geminiCliEnabled;
  }

  return next;
}

export function readAppSettings(): AppSettings {
  let fromFile: AppSettings = {};
  try {
    const raw = readFileSync(APP_SETTINGS_FILE, "utf-8");
    fromFile = coerceAppSettings(JSON.parse(raw));
  } catch {
    fromFile = {};
  }

  // Backward-compatible fallback for users who previously stored these in Claude settings.
  const legacy = readSettings();
  const legacyModel =
    fromFile.generationModel ??
    (typeof legacy.model === "string" && legacy.model.trim()
      ? legacy.model.trim()
      : undefined);
  const legacyThinking =
    fromFile.generationThinkingLevel ??
    (isThinkingLevel(legacy.effortLevel) ? legacy.effortLevel : "medium");
  const fromRuntimeDefaults = fromFile.generationDefaults || {};
  const generationDefaults: Partial<
    Record<GenerationRuntimeMode, RuntimeGenerationDefaults>
  > = {
    "claude-cli": {
      model: fromRuntimeDefaults["claude-cli"]?.model ?? legacyModel,
      thinkingLevel:
        fromRuntimeDefaults["claude-cli"]?.thinkingLevel ?? legacyThinking,
    },
    "codex-cli": {
      model: fromRuntimeDefaults["codex-cli"]?.model ?? legacyModel,
      thinkingLevel:
        fromRuntimeDefaults["codex-cli"]?.thinkingLevel ?? legacyThinking,
    },
    api: {
      model: fromRuntimeDefaults.api?.model ?? legacyModel,
      thinkingLevel: fromRuntimeDefaults.api?.thinkingLevel ?? legacyThinking,
    },
  };

  return {
    autoArchiveDays:
      fromFile.autoArchiveDays ??
      (typeof legacy.autoArchiveDays === "number"
        ? legacy.autoArchiveDays
        : undefined),
    disableHeaderView:
      fromFile.disableHeaderView ??
      (typeof legacy.disableHeaderView === "boolean"
        ? legacy.disableHeaderView
        : undefined),
    orphanTimeoutMs:
      fromFile.orphanTimeoutMs ??
      (typeof legacy.orphanTimeoutMs === "number"
        ? legacy.orphanTimeoutMs
        : undefined),
    sessionAutoLoadAll:
      typeof fromFile.sessionAutoLoadAll === "boolean"
        ? fromFile.sessionAutoLoadAll
        : undefined,
    generationRuntime:
      fromFile.generationRuntime ??
      "claude-cli",
    generationModel: legacyModel,
    generationThinkingLevel:
      fromFile.generationThinkingLevel ?? legacyThinking,
    generationDefaults,
    codexCliEnabled:
      typeof fromFile.codexCliEnabled === "boolean"
        ? fromFile.codexCliEnabled
        : true,
    geminiCliEnabled:
      typeof fromFile.geminiCliEnabled === "boolean"
        ? fromFile.geminiCliEnabled
        : true,
  };
}

export function writeAppSettings(settings: AppSettings): void {
  mkdirSync(dirname(APP_SETTINGS_FILE), { recursive: true });
  writeFileSync(
    APP_SETTINGS_FILE,
    JSON.stringify(settings, null, 2) + "\n",
    "utf-8",
  );
}
