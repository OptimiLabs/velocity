import path from "path";
import os from "os";

export const GEMINI_HOME = path.join(os.homedir(), ".gemini");
export const GEMINI_CONFIG = path.join(GEMINI_HOME, "settings.json");
export const GEMINI_TMP_DIR = path.join(GEMINI_HOME, "tmp");
export const GEMINI_VELOCITY_DIR = path.join(GEMINI_HOME, "velocity");
export const GEMINI_SKILLS_DIR = path.join(GEMINI_VELOCITY_DIR, "skills");
export const GEMINI_AGENTS_DIR = path.join(GEMINI_VELOCITY_DIR, "agents");
export const GEMINI_DISABLED_AGENTS_DIR = path.join(
  GEMINI_VELOCITY_DIR,
  "disabled",
  "agents",
);
export const GEMINI_HOOKS_DIR = path.join(GEMINI_VELOCITY_DIR, "hooks");

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
  return path.join(projectGeminiVelocityDir(projectPath), "skills");
}

export function projectGeminiAgentsDir(projectPath: string): string {
  return path.join(projectGeminiVelocityDir(projectPath), "agents");
}

export function projectGeminiDisabledAgentsDir(projectPath: string): string {
  return path.join(projectGeminiVelocityDir(projectPath), "disabled", "agents");
}

export function projectGeminiHooksDir(projectPath: string): string {
  return path.join(projectGeminiVelocityDir(projectPath), "hooks");
}
