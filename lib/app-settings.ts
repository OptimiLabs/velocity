import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { CLAUDE_DIR } from "./claude-paths";
import { readSettings } from "./claude-settings";

export const APP_SETTINGS_FILE = join(CLAUDE_DIR, "velocity-settings.json");

export interface AppSettings {
  autoArchiveDays?: number;
  disableHeaderView?: boolean;
  sessionAutoLoadAll?: boolean;
  orphanTimeoutMs?: number;
  [key: string]: unknown;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
