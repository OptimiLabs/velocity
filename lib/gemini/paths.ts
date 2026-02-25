import path from "path";
import os from "os";

export const GEMINI_HOME = path.join(os.homedir(), ".gemini");
export const GEMINI_CONFIG = path.join(GEMINI_HOME, "settings.json");
export const GEMINI_TMP_DIR = path.join(GEMINI_HOME, "tmp");

// Preferred Gemini artifact locations.
export const GEMINI_SKILLS_DIR = path.join(GEMINI_HOME, "skills");
export const GEMINI_AGENTS_DIR = path.join(GEMINI_HOME, "agents");
export const GEMINI_DISABLED_AGENTS_DIR = path.join(
  GEMINI_HOME,
  "disabled",
  "agents",
);
export const GEMINI_HOOKS_DIR = path.join(GEMINI_HOME, "hooks");

// Legacy Velocity-managed locations kept for backward compatibility.
export const GEMINI_VELOCITY_DIR = path.join(GEMINI_HOME, "velocity");
export const GEMINI_LEGACY_SKILLS_DIR = path.join(
  GEMINI_VELOCITY_DIR,
  "skills",
);
export const GEMINI_LEGACY_AGENTS_DIR = path.join(
  GEMINI_VELOCITY_DIR,
  "agents",
);
export const GEMINI_LEGACY_DISABLED_AGENTS_DIR = path.join(
  GEMINI_VELOCITY_DIR,
  "disabled",
  "agents",
);
export const GEMINI_LEGACY_HOOKS_DIR = path.join(GEMINI_VELOCITY_DIR, "hooks");

export function projectGeminiDir(projectPath: string): string {
  return path.join(projectPath, ".gemini");
}

export function projectGeminiConfig(projectPath: string): string {
  return path.join(projectPath, ".gemini", "settings.json");
}

export function projectGeminiVelocityDir(projectPath: string): string {
  return path.join(projectPath, ".gemini", "velocity");
}

export function projectGeminiSkillsDir(projectPath: string): string {
  return path.join(projectGeminiDir(projectPath), "skills");
}

export function projectGeminiLegacySkillsDir(projectPath: string): string {
  return path.join(projectGeminiVelocityDir(projectPath), "skills");
}

export function projectGeminiAgentsDir(projectPath: string): string {
  return path.join(projectGeminiDir(projectPath), "agents");
}

export function projectGeminiLegacyAgentsDir(projectPath: string): string {
  return path.join(projectGeminiVelocityDir(projectPath), "agents");
}

export function projectGeminiDisabledAgentsDir(projectPath: string): string {
  return path.join(projectGeminiDir(projectPath), "disabled", "agents");
}

export function projectGeminiLegacyDisabledAgentsDir(
  projectPath: string,
): string {
  return path.join(projectGeminiVelocityDir(projectPath), "disabled", "agents");
}

export function projectGeminiHooksDir(projectPath: string): string {
  return path.join(projectGeminiDir(projectPath), "hooks");
}

export function projectGeminiLegacyHooksDir(projectPath: string): string {
  return path.join(projectGeminiVelocityDir(projectPath), "hooks");
}

function dedupeDirs(dirs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of dirs) {
    const normalized = path.resolve(dir);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(dir);
  }
  return out;
}

export function getGeminiSkillDirs(projectPath?: string): string[] {
  if (projectPath) {
    return dedupeDirs([
      projectGeminiSkillsDir(projectPath),
      projectGeminiLegacySkillsDir(projectPath),
    ]);
  }
  return dedupeDirs([GEMINI_SKILLS_DIR, GEMINI_LEGACY_SKILLS_DIR]);
}

export function getGeminiAgentDirs(projectPath?: string): string[] {
  if (projectPath) {
    return dedupeDirs([
      projectGeminiAgentsDir(projectPath),
      projectGeminiLegacyAgentsDir(projectPath),
    ]);
  }
  return dedupeDirs([GEMINI_AGENTS_DIR, GEMINI_LEGACY_AGENTS_DIR]);
}

export function getGeminiDisabledAgentDirs(projectPath?: string): string[] {
  if (projectPath) {
    return dedupeDirs([
      projectGeminiDisabledAgentsDir(projectPath),
      projectGeminiLegacyDisabledAgentsDir(projectPath),
    ]);
  }
  return dedupeDirs([
    GEMINI_DISABLED_AGENTS_DIR,
    GEMINI_LEGACY_DISABLED_AGENTS_DIR,
  ]);
}

export function getGeminiHookDirs(projectPath?: string): string[] {
  if (projectPath) {
    return dedupeDirs([
      projectGeminiHooksDir(projectPath),
      projectGeminiLegacyHooksDir(projectPath),
    ]);
  }
  return dedupeDirs([GEMINI_HOOKS_DIR, GEMINI_LEGACY_HOOKS_DIR]);
}
