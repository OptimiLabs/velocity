import { WebSocketServer } from "../server/ws-server";
import { SessionWatcher } from "../server/watcher";

const wsServer = new WebSocketServer(3001);
const watcher = new SessionWatcher(wsServer);

watcher.start();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  watcher.stop();
  wsServer.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  watcher.stop();
  wsServer.close();
  process.exit(0);
});
