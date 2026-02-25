import path from "path";
import os from "os";

export const CODEX_HOME = path.join(os.homedir(), ".codex");
export const CODEX_CONFIG = path.join(CODEX_HOME, "config.toml");
export const CODEX_AGENTS_DIR = path.join(CODEX_HOME, "agents");
export const CODEX_INSTRUCTIONS_DIR = path.join(CODEX_HOME, "instructions");
export const CODEX_AGENTS_HOME = path.join(os.homedir(), ".agents");
export const CODEX_SKILLS_DIR = path.join(CODEX_HOME, "skills");
export const CODEX_LEGACY_SKILLS_DIR = path.join(CODEX_AGENTS_HOME, "skills");
export const CODEX_VELOCITY_DIR = path.join(CODEX_HOME, "velocity");
export const CODEX_VELOCITY_AGENTS_DIR = path.join(
  CODEX_VELOCITY_DIR,
  "agents",
);
export const CODEX_VELOCITY_DISABLED_AGENTS_DIR = path.join(
  CODEX_VELOCITY_DIR,
  "disabled",
  "agents",
);
export const CODEX_VELOCITY_HOOKS_DIR = path.join(CODEX_VELOCITY_DIR, "hooks");

export function projectCodexDir(projectPath: string): string {
  return path.join(projectPath, ".codex");
}

export function projectCodexConfig(projectPath: string): string {
  return path.join(projectPath, ".codex", "config.toml");
}

export function projectCodexRoleAgentsDir(projectPath: string): string {
  return path.join(projectPath, ".codex", "agents");
}

export function projectCodexAgentsDir(projectPath: string): string {
  return path.join(projectPath, ".agents");
}

export function projectCodexSkillsDir(projectPath: string): string {
  return path.join(projectCodexDir(projectPath), "skills");
}

export function projectCodexLegacySkillsDir(projectPath: string): string {
  return path.join(projectCodexAgentsDir(projectPath), "skills");
}

export function projectCodexInstructionsDir(projectPath: string): string {
  return path.join(projectPath, ".codex", "instructions");
}

export function projectCodexVelocityDir(projectPath: string): string {
  return path.join(projectPath, ".codex", "velocity");
}

export function projectCodexVelocityAgentsDir(projectPath: string): string {
  return path.join(projectCodexVelocityDir(projectPath), "agents");
}

export function projectCodexVelocityDisabledAgentsDir(projectPath: string): string {
  return path.join(projectCodexVelocityDir(projectPath), "disabled", "agents");
}

export function projectCodexVelocityHooksDir(projectPath: string): string {
  return path.join(projectCodexVelocityDir(projectPath), "hooks");
}
