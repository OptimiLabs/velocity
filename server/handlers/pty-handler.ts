import type { WebSocket } from "ws";
import { execFile } from "child_process";
import type { PtyManager } from "@/server/pty-manager";

export interface PtyHandlerDeps {
  sendTo: (ws: WebSocket, data: unknown) => void;
  ptyManager: PtyManager;
}

// OSC 7: file://hostname/path\x07  — emitted by modern shells after cd
const OSC7_RE = /\x1b\]7;file:\/\/[^/]*([^\x07\x1b\x9c]*)(?:\x07|\x1b\\|\x9c)/;

export class PtyHandler {
  private deps: PtyHandlerDeps;

  constructor(deps: PtyHandlerDeps) {
    this.deps = deps;
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
    },
  ) {
    const { terminalId, cwd, cols, rows, env, command, args } = msg;
    const pm = this.deps.ptyManager;
    const existed = pm.has(terminalId);
    try {
      if (!existed) {
        try {
          pm.create(terminalId, cwd || process.cwd(), cols || 80, rows || 24, env, command, args);
        } catch (spawnErr) {
          // If a custom command (e.g. "claude") fails to spawn, fall back to default shell
          // so the user still gets a working terminal instead of a blank screen
          if (command) {
            pm.create(terminalId, cwd || process.cwd(), cols || 80, rows || 24, env);
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
        // Parse OSC 7 for CWD tracking
        const osc7Match = OSC7_RE.exec(data);
        if (osc7Match?.[1]) {
          try {
            const cwd = decodeURIComponent(osc7Match[1]);
            this.deps.sendTo(ws, { type: "pty:cwd-change", terminalId, cwd });
          } catch {
            // Malformed URI in OSC 7 escape sequence — skip
          }
        }
      });
      pm.setExitHandler(terminalId, (exitCode) => {
        this.deps.sendTo(ws, { type: "pty:exit", terminalId, exitCode });
      });
      if (existed) {
        // Nudge resize → two SIGWINCH with different dimensions → guarantees shell redraws
        pm.nudgeResize(terminalId, cols || 80, rows || 24);
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

  handleInput(msg: { terminalId: string; data: string }) {
    this.deps.ptyManager.write(msg.terminalId, msg.data);
  }

  handleResize(msg: { terminalId: string; cols: number; rows: number }) {
    this.deps.ptyManager.resize(msg.terminalId, msg.cols, msg.rows);
  }

  handleClose(terminalId: string) {
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
          const osc7Match = OSC7_RE.exec(data);
          if (osc7Match?.[1]) {
            try {
              const cwd = decodeURIComponent(osc7Match[1]);
              this.deps.sendTo(ws, { type: "pty:cwd-change", terminalId: tid, cwd });
            } catch {
              // Malformed URI in OSC 7 escape sequence — skip
            }
          }
        });
        pm.setExitHandler(tid, (exitCode) => {
          this.deps.sendTo(ws, { type: "pty:exit", terminalId: tid, exitCode });
        });
        // Nudge resize to force shell prompt redraw after WS reconnect
        const dims = pm.getDimensions(tid);
        pm.nudgeResize(tid, dims?.cols ?? 80, dims?.rows ?? 24);
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
