import fs from "fs";
import os from "os";
import path from "path";
import { saveProjectSkill, saveSkill, deleteSkill, deleteProjectSkill } from "@/lib/skills";
import { saveCodexInstruction, deleteCodexInstruction } from "@/lib/codex/skills";
import { saveGeminiSkill, deleteGeminiSkill } from "@/lib/gemini/skills";
import { addRouterEntry, removeRouterEntry } from "@/lib/instructions/router-writer";
import type { ConfigProvider } from "@/types/provider";

function normalizeProvider(provider?: string | null): ConfigProvider {
  return provider === "codex" || provider === "gemini" ? provider : "claude";
}

function routeSkillInClaudeMd(skillName: string, trigger: string, projectPath?: string) {
  const claudeMdPath = projectPath
    ? path.join(projectPath, ".claude", "CLAUDE.md")
    : path.join(os.homedir(), ".claude", "CLAUDE.md");
  if (!fs.existsSync(claudeMdPath)) return;

  const content = fs.readFileSync(claudeMdPath, "utf-8");
  if (content.includes(`/${skillName}`)) return;

  const updated = addRouterEntry(content, {
    trigger,
    path: skillName,
    category: "skills",
    type: "skill",
  });
  fs.writeFileSync(claudeMdPath, updated, "utf-8");
}

function removeSkillRouteFromClaudeMd(skillName: string, projectPath?: string) {
  const claudeMdPath = projectPath
    ? path.join(projectPath, ".claude", "CLAUDE.md")
    : path.join(os.homedir(), ".claude", "CLAUDE.md");
  if (!fs.existsSync(claudeMdPath)) return;

  const content = fs.readFileSync(claudeMdPath, "utf-8");
  if (!content.includes(`/${skillName}`)) return;

  const cleaned = removeRouterEntry(content, skillName);
  fs.writeFileSync(claudeMdPath, cleaned, "utf-8");
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
    saveCodexInstruction(commandName, input.prompt, projectPath);
    return;
  }
  if (provider === "gemini") {
    saveGeminiSkill(commandName, input.prompt, projectPath);
    return;
  }

  if (projectPath) {
    saveProjectSkill(projectPath, commandName, description, input.prompt);
  } else {
    saveSkill(commandName, description, input.prompt);
  }

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
    return;
  }
  if (provider === "gemini") {
    deleteGeminiSkill(commandName, projectPath);
    return;
  }

  if (projectPath) {
    const deletedProjectSkill = deleteProjectSkill(projectPath, commandName);
    if (input.removeClaudeRoute !== false) {
      removeSkillRouteFromClaudeMd(commandName, projectPath);
    }

    // Backward compatibility for historical mis-synced global artifacts.
    if (!deletedProjectSkill) {
      deleteSkill(commandName);
      if (input.removeClaudeRoute !== false) {
        removeSkillRouteFromClaudeMd(commandName);
      }
    }
    return;
  }

  deleteSkill(commandName);
  if (input.removeClaudeRoute !== false) {
    removeSkillRouteFromClaudeMd(commandName);
  }
}
