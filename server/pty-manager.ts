import os from "os";
import fs from "fs";
import path from "path";
import * as pty from "node-pty";
import { WebSocket } from "ws";
import { getDefaultShell, killProcess } from "@/lib/platform";
import { ptyLog } from "@/lib/logger";

const MAX_EARLY_BUFFER_BYTES = 64 * 1024; // 64KB
const DEFAULT_ORPHAN_TIMEOUT_MS = 30 * 60 * 1000; // 30 min — keep PTYs alive longer for tab switching

const LOG_DIR = path.join(os.homedir(), ".claude", "terminal-logs");
const MAX_LOG_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 50;

// Strip ANSI escape codes (CSI sequences and OSC sequences)
function stripAnsi(str: string): string {
  return str
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "");
}

class SessionLogger {
  private logPath: string;
  private currentBytes = 0;
  private dirEnsured = false;
  private terminalId: string;

  constructor(terminalId: string) {
    this.terminalId = terminalId;
    this.logPath = this.newLogPath();
  }

  private newLogPath(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return path.join(LOG_DIR, `${this.terminalId}-${timestamp}.log`);
  }

  private ensureDir(): void {
    if (this.dirEnsured) return;
    fs.mkdirSync(LOG_DIR, { recursive: true });
    this.dirEnsured = true;
  }

  private enforceMaxFiles(): void {
    try {
      const files = fs.readdirSync(LOG_DIR)
        .filter((f) => f.endsWith(".log"))
        .map((f) => ({
          name: f,
          mtime: fs.statSync(path.join(LOG_DIR, f)).mtimeMs,
        }))
        .sort((a, b) => a.mtime - b.mtime);
      while (files.length > MAX_LOG_FILES) {
        const oldest = files.shift()!;
        try {
          fs.unlinkSync(path.join(LOG_DIR, oldest.name));
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore — dir may not exist yet */
    }
  }

  write(data: string): void {
    this.ensureDir();
    const cleaned = stripAnsi(data);
    const bytes = Buffer.byteLength(cleaned);

    // Rotate if current file exceeds max size
    if (this.currentBytes + bytes > MAX_LOG_FILE_BYTES) {
      this.logPath = this.newLogPath();
      this.currentBytes = 0;
      this.enforceMaxFiles();
    }

    fs.appendFileSync(this.logPath, cleaned);
    this.currentBytes += bytes;
  }

  close(): void {
    // Nothing to close for appendFileSync — included for future extensibility
  }
}

interface PtyEntry {
  pty: pty.IPty;
  owner: WebSocket | null;
  cwd: string;
  orphanTimeout?: ReturnType<typeof setTimeout>;
  dataHandler: ((data: string) => void) | null;
  exitHandler: ((exitCode: number) => void) | null;
  earlyDataBuffer: string[];
  earlyDataBufferBytes: number;
  logger: SessionLogger | null;
}

export class PtyManager {
  private sessions = new Map<string, PtyEntry>();
  private onPtyDied: ((terminalId: string) => void) | null = null;
  private orphanTimeoutMs = DEFAULT_ORPHAN_TIMEOUT_MS;

  setOnPtyDied(cb: (terminalId: string) => void): void {
    this.onPtyDied = cb;
  }

  /** Update the orphan timeout. 0 means indefinite (no auto-cleanup). */
  setOrphanTimeout(ms: number): void {
    this.orphanTimeoutMs = ms;
    ptyLog.info("orphan timeout updated", { ms: ms || "indefinite" });
  }

  create(
    id: string,
    cwd: string,
    cols: number,
    rows: number,
    env?: Record<string, string>,
    command?: string,
    args?: string[],
    logging?: boolean,
  ): void {
    // Defensive: kill any existing PTY for this ID to prevent orphaned processes
    const existing = this.sessions.get(id);
    if (existing) {
      existing.dataHandler = null;
      existing.exitHandler = null;
      existing.logger?.close();
      existing.pty.kill();
      this.sessions.delete(id);
    }

    // Expand ~ to real home directory — posix_spawnp doesn't do shell expansion
    const resolvedCwd = cwd.startsWith("~")
      ? cwd.replace(/^~/, os.homedir())
      : cwd;

    const cmd = command || getDefaultShell();
    const p = pty.spawn(cmd, args || [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: resolvedCwd,
      env: Object.fromEntries(
        Object.entries({
          ...process.env,
          ...env,
          // Enable OSC 7 CWD reporting — shells check TERM_PROGRAM to decide
          TERM_PROGRAM: "velocity",
          // Bash: emit OSC 7 after every command via PROMPT_COMMAND
          // Prepend to existing PROMPT_COMMAND so user config isn't overwritten
          PROMPT_COMMAND: `printf "\\e]7;file://%s%s\\a" "$(hostname)" "$PWD"${process.env.PROMPT_COMMAND ? `; ${process.env.PROMPT_COMMAND}` : ""}`,
        })
          .filter((e): e is [string, string] => e[1] != null)
          .filter(([k]) => !k.startsWith("CLAUDECODE") && !k.startsWith("CLAUDE_CODE_")),
      ),
    });
    // Inject OSC 7 precmd hook for zsh (PROMPT_COMMAND handles bash).
    // Strategy: wait for the first prompt (data output), then inject the hook
    // with output suppression so the user never sees the command.
    if (cmd.endsWith("zsh") || cmd.includes("/zsh")) {
      const injectHook = () => {
        // Leading space: excluded from zsh history (HIST_IGNORE_SPACE)
        // Braces: group commands so only one line echoes
        // printf at end: clears screen + scrollback via ANSI sequences
        p.write(
          ` { autoload -Uz add-zsh-hook 2>/dev/null && __velocity_osc7() { printf '\\e]7;file://%s%s\\a' "$(hostname)" "$PWD"; } && add-zsh-hook precmd __velocity_osc7; } &>/dev/null; printf '\\e[H\\e[2J\\e[3J'\n`
        );
      };

      // Wait for first PTY output (shell prompt ready), then inject.
      // Falls back to 500ms timeout if no output arrives.
      let injected = false;
      const fallbackTimer = setTimeout(() => {
        if (!injected) { injected = true; injectHook(); }
      }, 500);

      // Listen for first data event from the PTY
      const onFirstData = p.onData(() => {
        if (!injected) {
          injected = true;
          clearTimeout(fallbackTimer);
          // Small delay to let the prompt fully render
          setTimeout(injectHook, 50);
        }
        onFirstData.dispose();
      });
    }

    const entry: PtyEntry = {
      pty: p,
      owner: null,
      cwd: resolvedCwd,
      dataHandler: null,
      exitHandler: null,
      earlyDataBuffer: [],
      earlyDataBufferBytes: 0,
      logger: logging ? new SessionLogger(id) : null,
    };
    this.sessions.set(id, entry);
    ptyLog.info("spawned PTY", { id, cmd, pid: p.pid });

    // Attach listeners ONCE — they delegate to the stored handler
    p.onData((data) => {
      if (entry.logger) {
        entry.logger.write(data);
      }
      if (entry.dataHandler) {
        entry.dataHandler(data);
      } else {
        // Buffer data that arrives before a handler is set (e.g. shell prompt)
        // Cap at 64KB total to prevent unbounded growth
        if (entry.earlyDataBufferBytes < MAX_EARLY_BUFFER_BYTES) {
          entry.earlyDataBuffer.push(data);
          entry.earlyDataBufferBytes += Buffer.byteLength(data);
        }
      }
    });
    p.onExit(({ exitCode }) => {
      entry.exitHandler?.(exitCode);
    });
  }

  setDataHandler(id: string, cb: (data: string) => void): void {
    const entry = this.sessions.get(id);
    if (!entry) return;
    entry.dataHandler = cb;
    // Flush any data that arrived before the handler was set
    if (entry.earlyDataBuffer.length > 0) {
      for (const chunk of entry.earlyDataBuffer) cb(chunk);
      entry.earlyDataBuffer = [];
      entry.earlyDataBufferBytes = 0;
    }
  }

  setExitHandler(id: string, cb: (exitCode: number) => void): void {
    const entry = this.sessions.get(id);
    if (entry) entry.exitHandler = cb;
  }

  clearEarlyDataBuffer(id: string): void {
    const entry = this.sessions.get(id);
    if (entry) {
      entry.earlyDataBuffer = [];
      entry.earlyDataBufferBytes = 0;
    }
  }

  setLogging(id: string, enabled: boolean): void {
    const entry = this.sessions.get(id);
    if (!entry) return;
    if (enabled && !entry.logger) {
      entry.logger = new SessionLogger(id);
    } else if (!enabled && entry.logger) {
      entry.logger.close();
      entry.logger = null;
    }
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.pty.resize(cols, rows);
  }

  /** Resize to current dimensions — triggers SIGWINCH without changing size */
  resizeCurrent(id: string): void {
    const entry = this.sessions.get(id);
    if (entry) {
      entry.pty.resize(entry.pty.cols, entry.pty.rows);
    }
  }

  /**
   * Nudge resize: briefly shrink by 1 col then restore.
   * Many shells ignore same-size SIGWINCH but a real dimension change
   * guarantees the shell redraws its prompt — essential after page reload.
   */
  nudgeResize(id: string, cols: number, rows: number): void {
    const entry = this.sessions.get(id);
    if (!entry) return;
    const nudgeCols = Math.max(1, cols - 1);
    entry.pty.resize(nudgeCols, rows);
    // Restore real size after a tick so the shell sees two distinct resizes
    setTimeout(() => {
      const e = this.sessions.get(id);
      if (e) e.pty.resize(cols, rows);
    }, 50);
  }

  close(id: string): void {
    const entry = this.sessions.get(id);
    if (entry) {
      const pid = entry.pty.pid;
      ptyLog.info("closing PTY", { id, pid });
      // Null out handlers BEFORE killing to prevent stale closures from sending
      entry.dataHandler = null;
      entry.exitHandler = null;
      entry.logger?.close();
      entry.logger = null;
      entry.pty.kill();
      // SIGKILL fallback after 3s — cleared if process exits before timeout
      if (pid) {
        const killTimer = setTimeout(() => {
          try {
            process.kill(pid, 0);
            ptyLog.warn("SIGKILL fallback fired", { id, pid });
            killProcess(pid);
          } catch {
            /* already dead */
          }
        }, 3_000);
        entry.pty.onExit(() => clearTimeout(killTimer));
      }
      if (entry.orphanTimeout) clearTimeout(entry.orphanTimeout);
      this.sessions.delete(id);
    }
  }

  setOwner(id: string, owner: WebSocket | null): void {
    const entry = this.sessions.get(id);
    if (entry) entry.owner = owner;
  }

  orphanForClient(ws: WebSocket): void {
    const timeoutMs = this.orphanTimeoutMs;
    for (const [id, entry] of this.sessions) {
      if (entry.owner === ws) {
        entry.owner = null;
        entry.dataHandler = null;   // route output to earlyDataBuffer
        entry.exitHandler = null;   // prevent stale WS send on exit
        if (timeoutMs <= 0) {
          ptyLog.info("orphaned PTY, indefinite persistence", { id, pid: entry.pty.pid });
          continue; // No timeout — PTY lives until server restart or manual close
        }
        const label = timeoutMs >= 60_000 ? `${Math.round(timeoutMs / 60_000)}m` : `${timeoutMs / 1000}s`;
        ptyLog.info(`orphaned PTY, will kill in ${label}`, { id, pid: entry.pty.pid });
        entry.orphanTimeout = setTimeout(() => {
          const e = this.sessions.get(id);
          if (e && !e.owner) {
            const pid = e.pty.pid;
            ptyLog.info("orphan timeout expired, killing PTY", { id, pid });
            e.pty.kill();
            // SIGKILL fallback after 3s — cleared if process exits before timeout
            if (pid) {
              const killTimer = setTimeout(() => {
                try {
                  process.kill(pid, 0);
                  ptyLog.warn("SIGKILL fallback fired", { id, pid });
                  killProcess(pid);
                } catch {
                  /* already dead */
                }
              }, 3_000);
              e.pty.onExit(() => clearTimeout(killTimer));
            }
            this.sessions.delete(id);
            this.onPtyDied?.(id);
          }
        }, timeoutMs);
      }
    }
  }

  reclaimForClient(ws: WebSocket, ids: string[]): void {
    for (const id of ids) {
      const entry = this.sessions.get(id);
      if (entry) {
        entry.owner = ws;
        if (entry.orphanTimeout) {
          clearTimeout(entry.orphanTimeout);
          entry.orphanTimeout = undefined;
        }
      }
    }
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  getDimensions(id: string): { cols: number; rows: number } | null {
    const entry = this.sessions.get(id);
    if (!entry) return null;
    return { cols: entry.pty.cols, rows: entry.pty.rows };
  }

  closeAll(): void {
    ptyLog.info("closing all PTY sessions", { count: this.sessions.size });
    for (const [id, entry] of this.sessions) {
      if (entry.orphanTimeout) clearTimeout(entry.orphanTimeout);
      entry.logger?.close();
      entry.logger = null;
      const pid = entry.pty.pid;
      entry.pty.kill();
      // SIGKILL fallback after 3s — cleared if process exits before timeout
      if (pid) {
        const killTimer = setTimeout(() => {
          try {
            process.kill(pid, 0);
            ptyLog.warn("SIGKILL fallback fired", { id, pid });
            killProcess(pid);
          } catch {
            /* already dead */
          }
        }, 3_000);
        entry.pty.onExit(() => clearTimeout(killTimer));
      }
    }
    this.sessions.clear();
  }
}
