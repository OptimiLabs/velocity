import fs from "fs";
import os from "os";
import path from "path";
import { saveProjectSkill, saveSkill, deleteSkill, deleteProjectSkill } from "@/lib/skills";
import { saveCodexInstruction, deleteCodexInstruction } from "@/lib/codex/skills";
import { saveGeminiSkill, deleteGeminiSkill } from "@/lib/gemini/skills";
import {
  addRouterEntry,
  generateRouterContent,
  removeRouterEntry,
} from "@/lib/instructions/router-writer";
import { writeToml } from "@/lib/codex/toml";
import { CODEX_HOME } from "@/lib/codex/paths";
import {
  readGeminiConfigFrom,
  resolveGeminiContextFileName,
} from "@/lib/gemini/config";
import {
  GEMINI_CONFIG,
  GEMINI_HOME,
  projectGeminiConfig,
} from "@/lib/gemini/paths";
import type { ConfigProvider } from "@/types/provider";

function hasExactSkillRoute(content: string, skillName: string): boolean {
  const escapedName = skillName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rowRegex = new RegExp(
    `^\\|\\s*.+?\\s*\\|\\s*\`?\\/${escapedName}\`?\\s*\\|`,
    "m",
  );
  return rowRegex.test(content);
}

function normalizeProvider(provider?: string | null): ConfigProvider {
  return provider === "codex" || provider === "gemini" ? provider : "claude";
}

function routeSkillInClaudeMd(skillName: string, trigger: string, projectPath?: string) {
  const claudeMdPath = projectPath
    ? path.join(projectPath, ".claude", "CLAUDE.md")
    : path.join(os.homedir(), ".claude", "CLAUDE.md");
  if (!fs.existsSync(claudeMdPath)) return;

  const content = fs.readFileSync(claudeMdPath, "utf-8");
  if (hasExactSkillRoute(content, skillName)) return;

  const updated = addRouterEntry(content, {
    trigger,
    path: skillName,
    category: "skills",
    type: "skill",
  });
  fs.writeFileSync(claudeMdPath, updated, "utf-8");
}

function getClaudeCommandPath(commandName: string, projectPath?: string): string {
  return projectPath
    ? path.join(projectPath, ".claude", "commands", `${commandName}.md`)
    : path.join(os.homedir(), ".claude", "commands", `${commandName}.md`);
}

function saveClaudeSlashCommand(
  commandName: string,
  prompt: string,
  projectPath?: string,
) {
  try {
    const filePath = getClaudeCommandPath(commandName, projectPath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const normalized = prompt.trim() ? `${prompt.trim()}\n` : "";
    fs.writeFileSync(filePath, normalized, "utf-8");
  } catch {
    // Best-effort sync only; workflow deployment should still succeed.
  }
}

function removeClaudeSlashCommand(commandName: string, projectPath?: string) {
  try {
    const filePath = getClaudeCommandPath(commandName, projectPath);
    if (!fs.existsSync(filePath)) return;
    fs.unlinkSync(filePath);
  } catch {
    // Best-effort cleanup only.
  }
}

function getGeminiCommandPath(commandName: string, projectPath?: string): string {
  return projectPath
    ? path.join(projectPath, ".gemini", "commands", `${commandName}.toml`)
    : path.join(GEMINI_HOME, "commands", `${commandName}.toml`);
}

function saveGeminiSlashCommand(
  commandName: string,
  prompt: string,
  description: string,
  projectPath?: string,
) {
  try {
    const filePath = getGeminiCommandPath(commandName, projectPath);
    const normalizedPrompt = prompt.trim() ? `${prompt.trim()}\n` : "";
    const payload: { prompt: string; description?: string } = {
      prompt: normalizedPrompt,
    };
    if (description.trim()) {
      payload.description = description.trim();
    }
    writeToml(filePath, payload);
  } catch {
    // Best-effort sync only; workflow deployment should still succeed.
  }
}

function removeGeminiSlashCommand(
  commandName: string,
  projectPath?: string,
): boolean {
  try {
    const filePath = getGeminiCommandPath(commandName, projectPath);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  } catch {
    // Best-effort cleanup only.
    return false;
  }
}

function removeSkillRouteFromClaudeMd(skillName: string, projectPath?: string) {
  const claudeMdPath = projectPath
    ? path.join(projectPath, ".claude", "CLAUDE.md")
    : path.join(os.homedir(), ".claude", "CLAUDE.md");
  if (!fs.existsSync(claudeMdPath)) return;

  const content = fs.readFileSync(claudeMdPath, "utf-8");
  if (!hasExactSkillRoute(content, skillName)) return;

  const cleaned = removeRouterEntry(content, skillName);
  fs.writeFileSync(claudeMdPath, cleaned, "utf-8");
}

function routeSkillInCodexAgentsMd(
  skillName: string,
  trigger: string,
  projectPath?: string,
) {
  const codexAgentsPath = projectPath
    ? path.join(projectPath, "AGENTS.md")
    : path.join(CODEX_HOME, "AGENTS.md");
  if (!fs.existsSync(codexAgentsPath)) {
    fs.mkdirSync(path.dirname(codexAgentsPath), { recursive: true });
    const initial = generateRouterContent("", [
      {
        trigger,
        path: skillName,
        category: "skills",
        type: "skill",
      },
    ]);
    fs.writeFileSync(codexAgentsPath, initial, "utf-8");
    return;
  }

  const content = fs.readFileSync(codexAgentsPath, "utf-8");
  if (hasExactSkillRoute(content, skillName)) return;

  const updated = addRouterEntry(content, {
    trigger,
    path: skillName,
    category: "skills",
    type: "skill",
  });
  fs.writeFileSync(codexAgentsPath, updated, "utf-8");
}

function removeSkillRouteFromCodexAgentsMd(skillName: string, projectPath?: string) {
  const codexAgentsPath = projectPath
    ? path.join(projectPath, "AGENTS.md")
    : path.join(CODEX_HOME, "AGENTS.md");
  if (!fs.existsSync(codexAgentsPath)) return;

  const content = fs.readFileSync(codexAgentsPath, "utf-8");
  if (!hasExactSkillRoute(content, skillName)) return;

  const cleaned = removeRouterEntry(content, skillName);
  fs.writeFileSync(codexAgentsPath, cleaned, "utf-8");
}

function resolveGeminiEntrypointCandidates(projectPath?: string): string[] {
  const settingsPath = projectPath
    ? projectGeminiConfig(projectPath)
    : GEMINI_CONFIG;
  const contextFileName = resolveGeminiContextFileName(
    readGeminiConfigFrom(settingsPath),
  );
  const baseDir = projectPath || GEMINI_HOME;
  const configuredPath = path.isAbsolute(contextFileName)
    ? contextFileName
    : path.resolve(baseDir, contextFileName);
  const legacyPath = projectPath
    ? path.join(projectPath, "GEMINI.md")
    : path.join(GEMINI_HOME, "GEMINI.md");

  const configuredResolved = path.resolve(configuredPath);
  const legacyResolved = path.resolve(legacyPath);
  return configuredResolved === legacyResolved
    ? [configuredPath]
    : [configuredPath, legacyPath];
}

function findExistingGeminiEntrypoint(projectPath?: string): string | null {
  for (const candidate of resolveGeminiEntrypointCandidates(projectPath)) {
    if (!fs.existsSync(candidate)) continue;
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Ignore unreadable candidate and try next fallback.
    }
  }
  return null;
}

function routeSkillInGeminiMd(
  skillName: string,
  trigger: string,
  projectPath?: string,
) {
  const geminiMdPath = findExistingGeminiEntrypoint(projectPath);
  if (!geminiMdPath) return;
  if (!fs.existsSync(geminiMdPath)) return;

  const content = fs.readFileSync(geminiMdPath, "utf-8");
  if (hasExactSkillRoute(content, skillName)) return;

  const updated = addRouterEntry(content, {
    trigger,
    path: skillName,
    category: "skills",
    type: "skill",
  });
  fs.writeFileSync(geminiMdPath, updated, "utf-8");
}

function removeSkillRouteFromGeminiMd(skillName: string, projectPath?: string) {
  const geminiMdPath = findExistingGeminiEntrypoint(projectPath);
  if (!geminiMdPath) return;
  if (!fs.existsSync(geminiMdPath)) return;

  const content = fs.readFileSync(geminiMdPath, "utf-8");
  if (!hasExactSkillRoute(content, skillName)) return;

  const cleaned = removeRouterEntry(content, skillName);
  fs.writeFileSync(geminiMdPath, cleaned, "utf-8");
}

export function syncWorkflowCommandArtifact(input: {
  provider?: ConfigProvider | null;
  commandName: string;
  commandDescription?: string | null;
  prompt: string;
  projectPath?: string | null;
  autoRouteClaude?: boolean;
}) {
  const provider = normalizeProvider(input.provider);
  const commandName = input.commandName;
  const description =
    input.commandDescription?.trim() ||
    commandName.replace(/-/g, " ");
  const projectPath = input.projectPath ?? undefined;

  if (provider === "codex") {
    saveCodexInstruction(commandName, input.prompt, projectPath, description);
    routeSkillInCodexAgentsMd(commandName, description, projectPath);
    return;
  }
  if (provider === "gemini") {
    saveGeminiSkill(commandName, input.prompt, projectPath, description);
    saveGeminiSlashCommand(commandName, input.prompt, description, projectPath);
    routeSkillInGeminiMd(commandName, description, projectPath);
    return;
  }

  if (projectPath) {
    saveProjectSkill(projectPath, commandName, description, input.prompt);
  } else {
    saveSkill(commandName, description, input.prompt);
  }

  // Keep native Claude slash-command parity with workflow deploy.
  saveClaudeSlashCommand(commandName, input.prompt, projectPath);

  if (input.autoRouteClaude !== false) {
    routeSkillInClaudeMd(commandName, description, projectPath);
  }
}

export function cleanupWorkflowCommandArtifact(input: {
  provider?: ConfigProvider | null;
  commandName?: string | null;
  projectPath?: string | null;
  removeClaudeRoute?: boolean;
}) {
  if (!input.commandName) return;

  const provider = normalizeProvider(input.provider);
  const commandName = input.commandName;
  const projectPath = input.projectPath ?? undefined;

  if (provider === "codex") {
    deleteCodexInstruction(commandName, projectPath);
    if (input.removeClaudeRoute !== false) {
      removeSkillRouteFromCodexAgentsMd(commandName, projectPath);
    }
    return;
  }
  if (provider === "gemini") {
    const deletedProjectSkill = deleteGeminiSkill(commandName, projectPath);
    const deletedProjectCommand = removeGeminiSlashCommand(
      commandName,
      projectPath,
    );
    if (input.removeClaudeRoute !== false) {
      removeSkillRouteFromGeminiMd(commandName, projectPath);
    }
    if (projectPath && !deletedProjectSkill && !deletedProjectCommand) {
      deleteGeminiSkill(commandName);
      removeGeminiSlashCommand(commandName);
      if (input.removeClaudeRoute !== false) {
        removeSkillRouteFromGeminiMd(commandName);
      }
    }
    return;
  }

  if (projectPath) {
    const deletedProjectSkill = deleteProjectSkill(projectPath, commandName);
    removeClaudeSlashCommand(commandName, projectPath);
    if (input.removeClaudeRoute !== false) {
      removeSkillRouteFromClaudeMd(commandName, projectPath);
    }

    // Backward compatibility for historical mis-synced global artifacts.
    if (!deletedProjectSkill) {
      deleteSkill(commandName);
      removeClaudeSlashCommand(commandName);
      if (input.removeClaudeRoute !== false) {
        removeSkillRouteFromClaudeMd(commandName);
      }
    }
    return;
  }

  deleteSkill(commandName);
  removeClaudeSlashCommand(commandName);
  if (input.removeClaudeRoute !== false) {
    removeSkillRouteFromClaudeMd(commandName);
  }
}
