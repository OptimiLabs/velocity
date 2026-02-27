import type { WebSocket } from "ws";
import { execFile } from "child_process";
import type { PtyManager } from "@/server/pty-manager";

export interface PtyHandlerDeps {
  sendTo: (ws: WebSocket, data: unknown) => void;
  ptyManager: PtyManager;
}

// OSC 7: file://hostname/path\x07  — emitted by modern shells after cd
const OSC7_RE = /\x1b\]7;file:\/\/[^/]*([^\x07\x1b\x9c]*)(?:\x07|\x1b\\|\x9c)/;
// iTerm2: OSC 1337 CurrentDir=/path\x07
const OSC1337_CWD_RE =
  /\x1b\]1337;CurrentDir=([^\x07\x1b\x9c]*)(?:\x07|\x1b\\|\x9c)/;
const CWD_PROBE_DEBOUNCE_MS = 140;
const CWD_PROBE_THROTTLE_MS = 1000;

export class PtyHandler {
  private deps: PtyHandlerDeps;
  private cwdProbeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastCwdProbeAt = new Map<string, number>();

  constructor(deps: PtyHandlerDeps) {
    this.deps = deps;
  }

  private parseCwdFromOutput(data: string): string | null {
    const osc7Match = OSC7_RE.exec(data);
    if (osc7Match?.[1]) {
      try {
        return decodeURIComponent(osc7Match[1]);
      } catch {
        return osc7Match[1];
      }
    }
    const osc1337Match = OSC1337_CWD_RE.exec(data);
    if (osc1337Match?.[1]) {
      try {
        return decodeURIComponent(osc1337Match[1]);
      } catch {
        return osc1337Match[1];
      }
    }
    return null;
  }

  private emitCwdChange(ws: WebSocket, terminalId: string, cwd: string): void {
    if (!cwd) return;
    const previous = this.deps.ptyManager.getTrackedCwd(terminalId);
    if (previous === cwd) return;
    this.deps.ptyManager.setTrackedCwd(terminalId, cwd);
    this.deps.sendTo(ws, { type: "pty:cwd-change", terminalId, cwd });
  }

  private scheduleCwdProbe(ws: WebSocket, terminalId: string): void {
    const now = Date.now();
    const last = this.lastCwdProbeAt.get(terminalId) ?? 0;
    if (now - last < CWD_PROBE_THROTTLE_MS) return;
    this.lastCwdProbeAt.set(terminalId, now);

    const existing = this.cwdProbeTimers.get(terminalId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      this.cwdProbeTimers.delete(terminalId);
      const detected = await this.deps.ptyManager.resolveRuntimeCwd(terminalId);
      if (!detected) return;
      this.emitCwdChange(ws, terminalId, detected);
    }, CWD_PROBE_DEBOUNCE_MS);
    this.cwdProbeTimers.set(terminalId, timer);
  }

  handleCreate(
    ws: WebSocket,
    msg: {
      terminalId: string;
      cwd?: string;
      cols?: number;
      rows?: number;
      env?: Record<string, string>;
      command?: string;
      args?: string[];
      logging?: boolean;
    },
  ) {
    const { terminalId, cwd, cols, rows, env, command, args, logging } = msg;
    const pm = this.deps.ptyManager;
    const existed = pm.has(terminalId);
    try {
      if (!existed) {
        try {
          pm.create(
            terminalId,
            cwd || process.cwd(),
            cols || 80,
            rows || 24,
            env,
            command,
            args,
            logging,
          );
        } catch (spawnErr) {
          // If a custom command (e.g. "claude") fails to spawn, fall back to default shell
          // so the user still gets a working terminal instead of a blank screen
          if (command) {
            pm.create(
              terminalId,
              cwd || process.cwd(),
              cols || 80,
              rows || 24,
              env,
              undefined,
              undefined,
              logging,
            );
            // Notify client about the fallback so it can display a message
            this.deps.sendTo(ws, {
              type: "pty:spawn-fallback",
              terminalId,
              originalCommand: command,
              error: spawnErr instanceof Error ? spawnErr.message : String(spawnErr),
            });
          } else {
            throw spawnErr;
          }
        }
      }
      // Set/replace owner and handlers — works for both fresh create and reclaim
      pm.reclaimForClient(ws, [terminalId]);
      pm.setDataHandler(terminalId, (data) => {
        this.deps.sendTo(ws, { type: "pty:output", terminalId, data });
        // Parse shell-emitted cwd escape sequences when available.
        const cwd = this.parseCwdFromOutput(data);
        if (cwd) {
          this.emitCwdChange(ws, terminalId, cwd);
        }
      });
      pm.setExitHandler(terminalId, (exitCode) => {
        this.deps.sendTo(ws, { type: "pty:exit", terminalId, exitCode });
      });
      if (existed) {
        // Nudge resize → two SIGWINCH with different dimensions → guarantees shell redraws
        pm.nudgeResize(terminalId, cols || 80, rows || 24);
      }
      const initialCwd = pm.getTrackedCwd(terminalId);
      if (initialCwd) {
        this.deps.sendTo(ws, { type: "pty:cwd-change", terminalId, cwd: initialCwd });
      }
      this.deps.sendTo(ws, { type: "pty:created", terminalId, reclaimed: existed });
    } catch (err) {
      this.deps.sendTo(ws, {
        type: "pty:error",
        terminalId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  handleInput(ws: WebSocket, msg: { terminalId: string; data: string }) {
    this.deps.ptyManager.write(msg.terminalId, msg.data);
    if (/[\r\n]/.test(msg.data)) {
      // Fallback for shells that don't emit OSC cwd updates reliably.
      this.scheduleCwdProbe(ws, msg.terminalId);
    }
  }

  handleResize(msg: { terminalId: string; cols: number; rows: number }) {
    this.deps.ptyManager.resize(msg.terminalId, msg.cols, msg.rows);
  }

  handleClose(terminalId: string) {
    const probeTimer = this.cwdProbeTimers.get(terminalId);
    if (probeTimer) clearTimeout(probeTimer);
    this.cwdProbeTimers.delete(terminalId);
    this.lastCwdProbeAt.delete(terminalId);
    this.deps.ptyManager.close(terminalId);
  }

  handleReclaim(ws: WebSocket, terminalIds: string[]) {
    const pm = this.deps.ptyManager;
    pm.reclaimForClient(ws, terminalIds);
    // Update data/exit handlers to point to the new WS connection
    for (const tid of terminalIds) {
      if (pm.has(tid)) {
        pm.setDataHandler(tid, (data) => {
          this.deps.sendTo(ws, { type: "pty:output", terminalId: tid, data });
          const cwd = this.parseCwdFromOutput(data);
          if (cwd) {
            this.emitCwdChange(ws, tid, cwd);
          }
        });
        pm.setExitHandler(tid, (exitCode) => {
          this.deps.sendTo(ws, { type: "pty:exit", terminalId: tid, exitCode });
        });
        // Nudge resize to force shell prompt redraw after WS reconnect
        const dims = pm.getDimensions(tid);
        pm.nudgeResize(tid, dims?.cols ?? 80, dims?.rows ?? 24);
        const trackedCwd = pm.getTrackedCwd(tid);
        if (trackedCwd) {
          this.deps.sendTo(ws, { type: "pty:cwd-change", terminalId: tid, cwd: trackedCwd });
        }
      }
    }
  }

  private static ALLOWED_EDITORS = new Set([
    "code", "cursor", "vim", "nvim", "nano", "subl", "emacs", "mate", "idea",
    "webstorm", "goland", "pycharm", "rubymine", "zed", "hx", "micro", "kate",
    "gedit", "open",
  ]);

  handleExec(
    ws: WebSocket,
    msg: { command: string },
  ) {
    if (!msg.command) return;

    // Parse command into executable + arguments to prevent shell injection
    const parts = msg.command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
    if (!parts || parts.length === 0) return;

    const executable = parts[0];
    const baseName = executable.split("/").pop() || "";

    if (!PtyHandler.ALLOWED_EDITORS.has(baseName)) {
      this.deps.sendTo(ws, {
        type: "terminal:exec-error",
        error: `Command not allowed: ${baseName}. Only editor commands are permitted.`,
      });
      return;
    }

    const args = parts.slice(1).map((a) =>
      // Strip surrounding quotes from arguments
      a.replace(/^["']|["']$/g, ""),
    );

    // Execute the editor command detached so it doesn't block the server
    execFile(executable, args, { timeout: 10000 }, (err) => {
      if (err) {
        this.deps.sendTo(ws, {
          type: "terminal:exec-error",
          error: err.message,
        });
      }
    });
  }

}
