import * as pty from "node-pty";
import { killProcess } from "@/lib/platform";

function normalizePtyOutput(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function buildClaudeEnv(
  effort?: "low" | "medium" | "high",
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key === "CLAUDECODE" || key.startsWith("CLAUDE_")) continue;
    env[key] = value;
  }
  env.FORCE_COLOR = "0";
  if (effort) {
    env.CLAUDE_CODE_EFFORT_LEVEL = effort;
  }
  return env;
}

export async function claudeOneShot(
  prompt: string,
  cwd?: string,
  timeoutMs = 120_000,
  model?: string,
  effort?: "low" | "medium" | "high",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format",
      "text",
      "--no-session-persistence",
      "--setting-sources",
      "",
      "--strict-mcp-config",
    ];
    if (model) {
      args.unshift("--model", model);
    }

    let term: pty.IPty;
    try {
      term = pty.spawn("claude", args, {
        name: "xterm-256color",
        cols: 120,
        rows: 40,
        cwd: cwd || process.cwd(),
        env: buildClaudeEnv(effort),
      });
    } catch (err) {
      reject(err);
      return;
    }

    let settled = false;
    let output = "";
    let sigkillTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      try {
        term.kill();
      } catch {
        // ignored
      }
      const pid = term.pid;
      if (pid) {
        sigkillTimer = setTimeout(() => {
          try {
            process.kill(pid, 0);
            killProcess(pid);
          } catch {
            // ignored
          }
        }, 3_000);
      }
      if (settled) return;
      settled = true;
      reject(new Error(`Claude CLI timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      fn();
    };

    term.onData((chunk) => {
      output += chunk;
    });

    term.onExit(({ exitCode }) => {
      finish(() => {
        const text = normalizePtyOutput(output);
        if (exitCode === 0) {
          resolve(text);
          return;
        }
        reject(new Error(text || `claude exited with code ${exitCode}`));
      });
    });

    try {
      term.write(prompt);
      term.write("\x04");
    } catch (err) {
      finish(() => {
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    }
  });
}
