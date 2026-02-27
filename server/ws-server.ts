import { WebSocketServer as WSServer, WebSocket } from "ws";
import {
  listConsoleSessions,
  saveConsoleSession,
  updateConsoleSessionLabel,
  deleteConsoleSession,
  markConsoleSessionManuallyRenamed,
  listConsoleGroups,
  saveConsoleGroup,
  renameConsoleGroup,
  deleteConsoleGroup,
  updateConsoleSessionGroupId,
} from "../lib/db/console-sessions";
import { PtyManager } from "./pty-manager";
import { PtyHandler } from "./handlers/pty-handler";
import { UtilityHandler } from "./handlers/utility-handler";
import { wsLog } from "../lib/logger";

/** Discriminated union of all incoming WebSocket message types. */
type WsIncomingMessage =
  | { type: "ping" }
  | { type: "rename-session"; consoleSessionId: string; label: string; firstPrompt?: string }
  | { type: "set-auto-label"; consoleSessionId: string; label: string; firstPrompt?: string }
  | { type: "remove-session"; consoleSessionId: string }
  | { type: "group:create"; groupId: string; label: string; createdAt?: number }
  | { type: "group:rename"; groupId: string; label: string }
  | { type: "group:delete"; groupId: string }
  | { type: "session:persist"; consoleSessionId: string; cwd: string; label?: string; createdAt?: number; firstPrompt?: string; agentName?: string }
  | { type: "session:set-group"; consoleSessionId: string; groupId?: string | null }
  | { type: "pty:create"; terminalId: string; cwd?: string; cols?: number; rows?: number; env?: Record<string, string>; command?: string; args?: string[]; logging?: boolean }
  | { type: "pty:input"; terminalId: string; data: string }
  | { type: "pty:resize"; terminalId: string; cols: number; rows: number }
  | { type: "pty:close"; terminalId: string }
  | { type: "pty:reclaim"; terminalIds: string[] }
  | { type: "pty:sync-active"; terminalIds: string[] }
  | { type: "terminal:exec"; command: string }
  | { type: "init-project"; consoleSessionId: string }
  | { type: "doctor"; consoleSessionId: string }
  | { type: "env:current" }
  | { type: "settings:orphan-timeout"; timeoutMs: number };

export class WebSocketServer {
  private wss: WSServer;
  private clients: Set<WebSocket> = new Set();
  private ptyManager = new PtyManager();
  private heartbeatInterval: ReturnType<typeof setInterval>;

  // Handler modules
  private ptyHandler: PtyHandler;
  private utilityHandler: UtilityHandler;

  private asAliveSocket(ws: WebSocket): WebSocket & { isAlive?: boolean } {
    return ws as WebSocket & { isAlive?: boolean };
  }

  constructor(port: number = 3001) {
    this.wss = new WSServer({ port });

    // Initialize handlers with shared deps
    const sendTo = this.sendTo.bind(this);

    this.ptyHandler = new PtyHandler({ sendTo, ptyManager: this.ptyManager });
    this.ptyManager.setOnPtyDied((terminalId) => {
      this.broadcast({ type: "pty:died", terminalId });
    });
    this.utilityHandler = new UtilityHandler({
      sendTo,
      getClientCount: () => this.clients.size,
    });

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      this.asAliveSocket(ws).isAlive = true;
      wsLog.info("client connected", { total: this.clients.size });

      // Send all console sessions and groups from DB so any browser sees the same list
      try {
        const allSessions = listConsoleSessions();
        if (allSessions.length > 0) {
          this.sendTo(ws, {
            type: "console:resumable-sessions",
            sessions: allSessions,
          });
        }
        const allGroups = listConsoleGroups();
        if (allGroups.length > 0) {
          this.sendTo(ws, {
            type: "console:resumable-groups",
            groups: allGroups,
          });
        }
      } catch (err) {
        wsLog.warn("failed to load resumable sessions", err);
      }

      ws.on("pong", () => {
        this.asAliveSocket(ws).isAlive = true;
      });

      ws.on("message", (raw) => {
        this.asAliveSocket(ws).isAlive = true; // any message counts as alive
        let msgType: string | undefined;
        try {
          const parsed = JSON.parse(String(raw)) as unknown;
          if (!parsed || typeof parsed !== "object") return;
          const candidate = parsed as { type?: unknown };
          msgType = typeof candidate.type === "string" ? candidate.type : undefined;
          this.handleMessage(ws, parsed as WsIncomingMessage);
        } catch (err) {
          wsLog.error("handleMessage error", err, { type: msgType });
        }
      });

      ws.on("close", () => {
        this.ptyManager.orphanForClient(ws);
        this.clients.delete(ws);
      });

      ws.on("error", () => {
        this.ptyManager.orphanForClient(ws);
        this.clients.delete(ws);
      });
    });

    // Server-side heartbeat: ping clients every 30s, terminate unresponsive ones
    this.heartbeatInterval = setInterval(() => {
      for (const ws of this.clients) {
        const aliveWs = this.asAliveSocket(ws);
        if (aliveWs.isAlive === false) {
          ws.terminate();
          continue;
        }
        aliveWs.isAlive = false;
        ws.ping();
      }
    }, 30000);

    wsLog.info("WebSocket server started", { port });
  }

  private handleMessage(
    ws: WebSocket,
    msg: WsIncomingMessage,
  ) {
    switch (msg.type) {
      case "ping":
        this.sendTo(ws, { type: "pong" });
        break;

      // --- Session label management (DB-only, no Pipeline B) ---
      case "rename-session":
        if (msg.consoleSessionId && msg.label) {
          try {
            updateConsoleSessionLabel(msg.consoleSessionId, msg.label);
            markConsoleSessionManuallyRenamed(msg.consoleSessionId);
          } catch (err) {
            wsLog.debug("non-critical DB op failed", err, { type: "rename-session" });
          }
        }
        break;
      case "set-auto-label":
        if (msg.consoleSessionId && msg.label) {
          try {
            updateConsoleSessionLabel(
              msg.consoleSessionId,
              msg.label,
              msg.firstPrompt,
            );
          } catch (err) {
            wsLog.debug("non-critical DB op failed", err, { type: "set-auto-label" });
          }
        }
        break;
      case "remove-session":
        if (msg.consoleSessionId) {
          try {
            deleteConsoleSession(msg.consoleSessionId);
          } catch (err) {
            wsLog.debug("non-critical DB op failed", err, { type: "remove-session" });
          }
        }
        break;

      // --- Group messages ---
      case "group:create":
        if (msg.groupId && msg.label) {
          try {
            saveConsoleGroup(
              msg.groupId,
              msg.label,
              msg.createdAt ?? Date.now(),
            );
          } catch (err) {
            wsLog.debug("non-critical DB op failed", err, { type: "group:create" });
          }
        }
        break;
      case "group:rename":
        if (msg.groupId && msg.label) {
          try {
            renameConsoleGroup(msg.groupId, msg.label);
          } catch (err) {
            wsLog.debug("non-critical DB op failed", err, { type: "group:rename" });
          }
        }
        break;
      case "group:delete":
        if (msg.groupId) {
          try {
            deleteConsoleGroup(msg.groupId);
          } catch (err) {
            wsLog.debug("non-critical DB op failed", err, { type: "group:delete" });
          }
        }
        break;
      case "session:persist":
        if (msg.consoleSessionId && msg.cwd) {
          try {
            saveConsoleSession(
              msg.consoleSessionId,
              msg.cwd,
              msg.label ?? "New Session",
              msg.createdAt ?? Date.now(),
              msg.firstPrompt,
              msg.agentName,
            );
          } catch (err) {
            wsLog.debug("non-critical DB op failed", err, { type: "session:persist" });
          }
        }
        break;
      case "session:set-group":
        if (msg.consoleSessionId) {
          try {
            updateConsoleSessionGroupId(
              msg.consoleSessionId,
              msg.groupId ?? null,
            );
          } catch (err) {
            wsLog.debug("non-critical DB op failed", err, { type: "session:set-group" });
          }
        }
        break;

      // --- PTY terminal messages ---
      case "pty:create":
        this.ptyHandler.handleCreate(ws, msg);
        break;
      case "pty:input":
        this.ptyHandler.handleInput(ws, msg);
        break;
      case "pty:resize":
        this.ptyHandler.handleResize(msg);
        break;
      case "pty:close":
        this.ptyHandler.handleClose(msg.terminalId);
        break;
      case "pty:reclaim":
        this.ptyHandler.handleReclaim(ws, msg.terminalIds || []);
        break;
      case "pty:sync-active":
        this.ptyManager.syncActiveTerminals(
          Array.isArray(msg.terminalIds) ? msg.terminalIds : [],
        );
        break;

      // --- Semantic history: open file in editor ---
      case "terminal:exec":
        this.ptyHandler.handleExec(ws, msg);
        break;

      // --- Utility messages ---
      case "init-project":
        if (msg.consoleSessionId) {
          this.utilityHandler.handleInitProject(ws, msg.consoleSessionId);
        }
        break;
      case "doctor":
        if (msg.consoleSessionId) {
          this.utilityHandler.handleDoctor(ws, msg.consoleSessionId);
        }
        break;
      case "env:current":
        this.utilityHandler.handleEnvCurrent(ws);
        break;

      case "settings:orphan-timeout":
        if (typeof msg.timeoutMs === "number" && msg.timeoutMs >= 0) {
          this.ptyManager.setOrphanTimeout(msg.timeoutMs);
        }
        break;
    }
  }

  private sendTo(ws: WebSocket, data: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  broadcast(data: unknown) {
    const message = JSON.stringify(data);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }

  close() {
    clearInterval(this.heartbeatInterval);
    this.ptyManager.closeAll();
    this.wss.close();
  }
}
