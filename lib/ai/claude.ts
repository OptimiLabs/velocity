import { spawn } from "child_process";
import { killProcess } from "@/lib/platform";

export async function claudeOneShot(
  prompt: string,
  cwd?: string,
  timeoutMs = 120_000,
  model?: string,
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
    // Strip CLAUDECODE to avoid "nested session" block when dev server
    // was started from inside a Claude Code terminal
    const { CLAUDECODE: _, ...cleanEnv } = process.env;
    const proc = spawn("claude", args, {
      cwd: cwd || process.cwd(),
      env: { ...cleanEnv, FORCE_COLOR: "0" },
    });

    // Pipe prompt via stdin to avoid OS argument length limits
    proc.stdin.write(prompt);
    proc.stdin.end();

    let sigkillTimer: ReturnType<typeof setTimeout> | undefined;

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      // SIGKILL fallback — if SIGTERM is ignored, force kill after 3s
      const pid = proc.pid;
      if (pid) {
        sigkillTimer = setTimeout(() => {
          try {
            process.kill(pid, 0);
            killProcess(pid);
          } catch {}
        }, 3_000);
      }
      reject(new Error(`Claude CLI timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    let output = "";
    let error = "";
    proc.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    proc.stderr.on("data", (chunk: Buffer) => (error += chunk.toString()));
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      if (code === 0) resolve(output.trim());
      else reject(new Error(error || `claude exited with code ${code}`));
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      reject(err);
    });
  });
}
