import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import type { WebSocket } from "ws";

export interface UtilityHandlerDeps {
  sendTo: (ws: WebSocket, data: unknown) => void;
  getClientCount: () => number;
}

export class UtilityHandler {
  private deps: UtilityHandlerDeps;

  constructor(deps: UtilityHandlerDeps) {
    this.deps = deps;
  }

  handleInitProject(ws: WebSocket, consoleSessionId: string) {
    const cwd = process.cwd();
    const claudeMdPath = path.join(cwd, "CLAUDE.md");
    if (fs.existsSync(claudeMdPath)) {
      this.deps.sendTo(ws, {
        type: "system",
        consoleSessionId,
        data: "CLAUDE.md already exists in this project.",
      });
    } else {
      const template = `# Project Instructions\n\nThis file provides instructions for Claude Code when working in this project.\n\n## Project Overview\n\n<!-- Describe your project here -->\n\n## Code Style\n\n<!-- Describe coding conventions -->\n\n## Commands\n\n- \`bun dev\` — start development server\n- \`bun test\` — run tests\n- \`bun lint\` — run linter\n`;
      fs.writeFileSync(claudeMdPath, template, "utf-8");
      this.deps.sendTo(ws, {
        type: "system",
        consoleSessionId,
        data: `Created CLAUDE.md in ${cwd}`,
      });
    }
  }

  handleDoctor(ws: WebSocket, consoleSessionId: string) {
    const checks: string[] = [];
    // Check claude CLI
    try {
      const version = execSync("claude --version", {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      checks.push(`\u2713 Claude CLI: ${version}`);
    } catch {
      checks.push("\u2717 Claude CLI: not found or not working");
    }
    // Check API key
    if (process.env.ANTHROPIC_API_KEY) {
      checks.push("\u2713 API key: set");
    } else {
      checks.push("\u26A0 API key: not set in env (may be using system auth)");
    }
    // Check node
    checks.push(`\u2713 Node.js: ${process.version}`);
    // Check WebSocket
    checks.push(
      `\u2713 WebSocket: ${this.deps.getClientCount()} client(s) connected`,
    );
    this.deps.sendTo(ws, {
      type: "system",
      consoleSessionId,
      data: `Diagnostics:\n${checks.join("\n")}`,
    });
  }

  private static ALLOWED_ENV_KEYS = new Set([
    "PATH", "HOME", "SHELL", "TERM", "TERM_PROGRAM", "USER", "LOGNAME",
    "LANG", "LC_ALL", "LC_CTYPE", "EDITOR", "VISUAL", "DISPLAY",
    "NODE_ENV", "HOSTNAME", "PWD", "OLDPWD", "TMPDIR", "XDG_DATA_HOME",
    "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_RUNTIME_DIR", "COLORTERM",
    "SHLVL", "PAGER", "LESS", "CLICOLOR", "CLICOLOR_FORCE",
  ]);

  handleEnvCurrent(ws: WebSocket) {
    const safeEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (
        v &&
        (UtilityHandler.ALLOWED_ENV_KEYS.has(k) || k.startsWith("NEXT_PUBLIC_"))
      ) {
        safeEnv[k] = v;
      }
    }
    this.deps.sendTo(ws, { type: "env:current", env: safeEnv });
  }
}
