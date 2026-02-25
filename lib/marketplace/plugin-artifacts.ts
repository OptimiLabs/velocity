import {
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from "fs";
import { dirname, join } from "path";
import {
  AGENTS_DIR,
  DISABLED_AGENTS_DIR,
} from "@/lib/claude-paths";
import { deleteSkill, setSkillDisabled } from "@/lib/skills";
import {
  deleteCodexInstruction,
  setCodexInstructionDisabled,
} from "@/lib/codex/skills";
import { deleteGeminiSkill, setGeminiSkillDisabled } from "@/lib/gemini/skills";
import {
  CODEX_VELOCITY_AGENTS_DIR,
  CODEX_VELOCITY_DISABLED_AGENTS_DIR,
} from "@/lib/codex/paths";
import {
  getGeminiAgentDirs,
  getGeminiDisabledAgentDirs,
} from "@/lib/gemini/paths";
import {
  deleteProviderAgent,
  syncProviderAgentRegistry,
} from "@/lib/providers/agent-files";
import {
  readProviderMcpState,
  writeProviderMcpState,
} from "@/lib/providers/mcp-settings";
import type { ConfigProvider } from "@/types/provider";

export function normalizeTargetProvider(value: unknown): ConfigProvider {
  return value === "codex" || value === "gemini" ? value : "claude";
}

function getGlobalAgentDirs(
  provider: ConfigProvider,
): { activeDirs: string[]; disabledDirs: string[] } {
  if (provider === "codex") {
    return {
      activeDirs: [CODEX_VELOCITY_AGENTS_DIR],
      disabledDirs: [CODEX_VELOCITY_DISABLED_AGENTS_DIR],
    };
  }
  if (provider === "gemini") {
    return {
      activeDirs: getGeminiAgentDirs(),
      disabledDirs: getGeminiDisabledAgentDirs(),
    };
  }
  return {
    activeDirs: [AGENTS_DIR],
    disabledDirs: [DISABLED_AGENTS_DIR],
  };
}

export function removeAgentForProvider(
  provider: ConfigProvider,
  name: string,
): boolean {
  const normalized = name.endsWith(".md") ? name.slice(0, -3) : name;
  return deleteProviderAgent(provider, normalized);
}

export function setAgentEntryDisabledForProvider(
  provider: ConfigProvider,
  name: string,
  disabled: boolean,
): boolean {
  const normalized = name.endsWith(".md") ? name.slice(0, -3) : name;
  const { activeDirs, disabledDirs } = getGlobalAgentDirs(provider);
  const preferredActivePath = join(activeDirs[0], `${normalized}.md`);
  const preferredDisabledPath = join(disabledDirs[0], `${normalized}.md`);
  const fromPaths = disabled
    ? activeDirs.map((dir) => join(dir, `${normalized}.md`))
    : disabledDirs.map((dir) => join(dir, `${normalized}.md`));
  const to = disabled ? preferredDisabledPath : preferredActivePath;

  let changed = false;
  for (const from of fromPaths) {
    if (!existsSync(from)) continue;
    if (from === to) {
      changed = true;
      continue;
    }
    if (existsSync(to)) {
      unlinkSync(from);
      changed = true;
    } else {
      mkdirSync(dirname(to), { recursive: true });
      renameSync(from, to);
      changed = true;
    }
  }

  const inDesiredLocation = existsSync(to);
  if ((changed || inDesiredLocation) && provider === "codex") {
    syncProviderAgentRegistry("codex");
  }
  return changed || inDesiredLocation;
}

export function removeSkillEntryForProvider(
  provider: ConfigProvider,
  skillName: string,
): boolean {
  const baseName = skillName.replace(/\.md$/, "");
  if (provider === "codex") {
    return deleteCodexInstruction(baseName);
  }
  if (provider === "gemini") {
    return deleteGeminiSkill(baseName);
  }
  return deleteSkill(baseName);
}

export function setSkillEntryDisabledForProvider(
  provider: ConfigProvider,
  skillName: string,
  disabled: boolean,
): boolean {
  const baseName = skillName.replace(/\.md$/, "");
  if (provider === "codex") {
    return setCodexInstructionDisabled(baseName, disabled);
  }
  if (provider === "gemini") {
    return setGeminiSkillDisabled(baseName, disabled);
  }
  return setSkillDisabled(baseName, disabled);
}

export function removeMcpForProvider(
  provider: ConfigProvider,
  name: string,
): boolean {
  const state = readProviderMcpState(provider);
  let removed = false;
  if (state.enabled[name]) {
    delete state.enabled[name];
    removed = true;
  }
  if (state.disabled[name]) {
    delete state.disabled[name];
    removed = true;
  }
  if (removed) {
    writeProviderMcpState(provider, state);
  }
  return removed;
}

export function setMcpForProviderDisabled(
  provider: ConfigProvider,
  name: string,
  disabled: boolean,
): boolean {
  const state = readProviderMcpState(provider);
  if (disabled) {
    if (state.disabled[name]) return true;
    const config = state.enabled[name];
    if (!config) return false;
    state.disabled[name] = config;
    delete state.enabled[name];
    writeProviderMcpState(provider, state);
    return true;
  }

  if (state.enabled[name]) return true;
  const config = state.disabled[name];
  if (!config) return false;
  state.enabled[name] = config;
  delete state.disabled[name];
  writeProviderMcpState(provider, state);
  return true;
}
