import { cleanupLog } from "./lib/logger";

export async function register() {
  // Only start the WS server on the Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Prevent double-start in dev mode (HMR re-runs register())
    const key = "__ws_server_started";
    const instanceKey = "__ws_server_instance";
    if ((globalThis as Record<string, unknown>)[key]) return;
    (globalThis as Record<string, unknown>)[key] = true;

    try {
      // Close previous WS server instance if it exists (HMR restart cleanup)
      const existing = (globalThis as Record<string, unknown>)[instanceKey] as
        | { close: () => void }
        | undefined;
      if (existing) {
        try {
          existing.close(); // kills all managed child processes
        } catch (err) {
          cleanupLog.warn("HMR: failed to close previous WS server", err);
        }
      }

      const { WebSocketServer } = await import("./server/ws-server");
      const { SessionWatcher } = await import("./server/watcher");

      const wsPort = parseInt(process.env.WS_PORT || "3001", 10);
      const wsServer = new WebSocketServer(wsPort);
      const watcher = new SessionWatcher(wsServer);

      watcher.start();

      // Store instance on globalThis so HMR restarts can close it
      (globalThis as Record<string, unknown>)[instanceKey] = wsServer;

      // Graceful shutdown
      const shutdown = () => {
        watcher.stop();
        wsServer.close();
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      cleanupLog.info("WebSocket server + watchers started via instrumentation");
    } catch (err) {
      cleanupLog.error("failed to start WebSocket server", err);
    }
  }
}
