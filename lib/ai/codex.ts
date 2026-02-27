import * as pty from "node-pty";
import { killProcess } from "@/lib/platform";
import { spawnCliPty, writePromptAndEof } from "@/lib/ai/pty-runtime";

type EffortLevel = "low" | "medium" | "high";

function normalizePtyOutput(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export async function codexOneShot(
  prompt: string,
  cwd?: string,
  timeoutMs = 120_000,
  opts?: {
    model?: string;
    effort?: EffortLevel;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args: string[] = [
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--color",
      "never",
    ];
    if (opts?.model) {
      args.push("--model", opts.model);
    }
    if (opts?.effort) {
      args.push("-c", `model_reasoning_effort="${opts.effort}"`);
    }
    args.push("-");

    let term: pty.IPty;
    try {
      term = spawnCliPty("codex", args, {
        cols: 120,
        rows: 40,
        cwd: cwd || process.cwd(),
        env: Object.fromEntries(
          Object.entries({
            ...process.env,
            FORCE_COLOR: "0",
          }).filter((entry): entry is [string, string] => entry[1] !== undefined),
        ),
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
      reject(new Error(`Codex CLI timed out after ${timeoutMs / 1000}s`));
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
        reject(new Error(text || `codex exited with code ${exitCode}`));
      });
    });

    try {
      writePromptAndEof(term, prompt);
    } catch (err) {
      finish(() => {
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    }
  });
}
