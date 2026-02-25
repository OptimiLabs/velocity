import type { ConfigProvider } from "@/types/provider";
import {
  CLAUDE_DIR,
  SKILLS_DIR,
  AGENTS_DIR,
  SETTINGS_FILE,
} from "@/lib/claude-paths";
import {
  CODEX_HOME,
  CODEX_CONFIG,
  CODEX_SKILLS_DIR,
  CODEX_VELOCITY_AGENTS_DIR,
} from "@/lib/codex/paths";
import {
  GEMINI_HOME,
  GEMINI_CONFIG,
  GEMINI_SKILLS_DIR,
  GEMINI_AGENTS_DIR,
} from "@/lib/gemini/paths";

export interface ProviderFilesystemDef {
  id: ConfigProvider;
  configDir: string;
  settingsFile: string | null;
  skillsDir: string | null;
  agentsDir: string | null;
  projectConfigSubdir: string;
  entrypointFileName: string;
  supportsHooks: boolean;
  supportsSkills: boolean;
  supportsAgents: boolean;
  supportsCommands: boolean;
}

type ProviderFeature = "hooks" | "skills" | "agents" | "commands";

const PROVIDER_FS: Record<ConfigProvider, ProviderFilesystemDef> = {
  claude: {
    id: "claude",
    configDir: CLAUDE_DIR,
    settingsFile: SETTINGS_FILE,
    skillsDir: SKILLS_DIR,
    agentsDir: AGENTS_DIR,
    projectConfigSubdir: ".claude",
    entrypointFileName: "CLAUDE.md",
    supportsHooks: true,
    supportsSkills: true,
    supportsAgents: true,
    supportsCommands: true,
  },
  codex: {
    id: "codex",
    configDir: CODEX_HOME,
    settingsFile: CODEX_CONFIG,
    skillsDir: CODEX_SKILLS_DIR,
    agentsDir: CODEX_VELOCITY_AGENTS_DIR,
    projectConfigSubdir: ".codex",
    entrypointFileName: "AGENTS.md",
    supportsHooks: false,
    supportsSkills: true,
    supportsAgents: true,
    supportsCommands: true,
  },
  gemini: {
    id: "gemini",
    configDir: GEMINI_HOME,
    settingsFile: GEMINI_CONFIG,
    skillsDir: GEMINI_SKILLS_DIR,
    agentsDir: GEMINI_AGENTS_DIR,
    projectConfigSubdir: ".gemini",
    entrypointFileName: "GEMINI.md",
    supportsHooks: true,
    supportsSkills: true,
    supportsAgents: true,
    supportsCommands: true,
  },
};

const FEATURE_TO_KEY: Record<ProviderFeature, keyof ProviderFilesystemDef> = {
  hooks: "supportsHooks",
  skills: "supportsSkills",
  agents: "supportsAgents",
  commands: "supportsCommands",
};

export function getProviderFs(id: ConfigProvider): ProviderFilesystemDef {
  return PROVIDER_FS[id];
}

export function getProvidersSupporting(
  feature: ProviderFeature,
): ConfigProvider[] {
  const key = FEATURE_TO_KEY[feature];
  return (Object.keys(PROVIDER_FS) as ConfigProvider[]).filter(
    (p) => PROVIDER_FS[p][key] === true,
  );
}

export function getAllProviderIds(): ConfigProvider[] {
  return Object.keys(PROVIDER_FS) as ConfigProvider[];
}
