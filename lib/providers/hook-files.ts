import fs from "fs";
import path from "path";
import type { ConfigProvider } from "@/types/provider";
import {
  CODEX_VELOCITY_HOOKS_DIR,
  projectCodexVelocityHooksDir,
} from "@/lib/codex/paths";
import { GEMINI_HOOKS_DIR, projectGeminiHooksDir } from "@/lib/gemini/paths";
import { SETTINGS_FILE } from "@/lib/claude-paths";

export interface ProviderHookArtifact {
  event: string;
  matcher?: string;
  hook: {
    type: "command" | "prompt" | "agent";
    command?: string;
    prompt?: string;
    timeout?: number;
    async?: boolean;
  };
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "hook"
  );
}

function getHookDir(provider: ConfigProvider, projectPath?: string): string {
  if (provider === "codex") {
    return projectPath
      ? projectCodexVelocityHooksDir(projectPath)
      : CODEX_VELOCITY_HOOKS_DIR;
  }
  if (provider === "gemini") {
    return projectPath ? projectGeminiHooksDir(projectPath) : GEMINI_HOOKS_DIR;
  }
  // Claude hooks are native to settings.json, but we persist single-rule exports
  // alongside settings for conversion/save parity.
  return projectPath
    ? path.join(projectPath, ".claude", "hooks")
    : path.join(path.dirname(SETTINGS_FILE), "hooks");
}

function buildHookFileName(hook: ProviderHookArtifact): string {
  const parts = [slugify(hook.event), slugify(hook.hook.type)];
  if (hook.matcher) parts.push(slugify(hook.matcher).slice(0, 32));
  return `${parts.join("-")}.json`;
}

export function saveProviderHookFile(params: {
  provider: ConfigProvider;
  hook: ProviderHookArtifact;
  projectPath?: string;
  fileName?: string;
  overwrite?: boolean;
}): { filePath: string; existed: boolean } {
  const { provider, hook, projectPath, fileName, overwrite = true } = params;
  const dir = getHookDir(provider, projectPath);
  fs.mkdirSync(dir, { recursive: true });
  const resolvedFileName = fileName || buildHookFileName(hook);
  const filePath = path.join(dir, resolvedFileName);
  const existed = fs.existsSync(filePath);
  if (existed && !overwrite) {
    return { filePath, existed: true };
  }
  fs.writeFileSync(filePath, JSON.stringify(hook, null, 2), "utf-8");
  return { filePath, existed };
}
