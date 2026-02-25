import { spawn, type ChildProcess } from "child_process";

export interface SessionOptions {
  cwd: string;
  prompt?: string;
  resume?: string;
}

export class ClaudeCLI {
  private process: ChildProcess | null = null;

  async startSession(options: SessionOptions): Promise<ChildProcess> {
    const args = ["--output-format", "stream-json"];

    if (options.resume) {
      args.push("--resume", options.resume);
    }
    if (options.prompt) {
      args.push("--print", options.prompt);
    }

    this.process = spawn("claude", args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    return this.process;
  }

  sendMessage(message: string) {
    if (this.process?.stdin?.writable) {
      this.process.stdin.write(message + "\n");
    }
  }

  stop() {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }
}
