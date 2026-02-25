import { watch } from "chokidar";
import path from "path";
import fs from "fs";
import { WebSocketServer } from "./ws-server";
import { watcherLog } from "@/lib/logger";
import { PROJECTS_DIR } from "@/lib/claude-paths";

const TAIL_READ_SIZE = 8192;
const PREVIEW_MAX_CHARS = 120;
const LAST_LINES_COUNT = 10;

function extractSessionMeta(filePath: string): {
  slug?: string;
  model?: string;
  lastMessagePreview?: string;
} {
  try {
    const fd = fs.openSync(filePath, "r");
    const stat = fs.fstatSync(fd);
    const readSize = Math.min(TAIL_READ_SIZE, stat.size);
    const buffer = Buffer.alloc(readSize);
    fs.readSync(fd, buffer, 0, readSize, Math.max(0, stat.size - readSize));
    fs.closeSync(fd);

    const tail = buffer.toString("utf-8");
    const lines = tail.split("\n").filter((l) => l.trim());
    const lastLines = lines.slice(-LAST_LINES_COUNT);

    let slug: string | undefined;
    let model: string | undefined;
    let lastMessagePreview: string | undefined;

    for (const line of lastLines) {
      try {
        const obj = JSON.parse(line);
        if (obj.slug) slug = obj.slug;
        if (obj.message?.model) model = obj.message.model;
        if (obj.message?.role === "assistant" && obj.message?.content) {
          const content = obj.message.content;
          if (typeof content === "string") {
            lastMessagePreview = content.slice(0, PREVIEW_MAX_CHARS);
          } else if (Array.isArray(content)) {
            const textBlock = content.find(
              (b: { type: string; text?: string }) =>
                b.type === "text" && b.text,
            );
            if (textBlock?.text) {
              lastMessagePreview = textBlock.text.slice(0, PREVIEW_MAX_CHARS);
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    return { slug, model, lastMessagePreview };
  } catch {
    return {};
  }
}

export class SessionWatcher {
  private watcher: ReturnType<typeof watch> | null = null;
  private wsServer: WebSocketServer;

  constructor(wsServer: WebSocketServer) {
    this.wsServer = wsServer;
  }

  start() {
    const pattern = path.join(PROJECTS_DIR, "**/*.jsonl");
    watcherLog.info("watching for session changes", { pattern });

    this.watcher = watch(pattern, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 800,
        pollInterval: 500,
      },
    });

    this.watcher.on("change", (filePath: string) => {
      const sessionId = path.basename(filePath, ".jsonl");
      const meta = extractSessionMeta(filePath);
      watcherLog.debug("session updated", { sessionId, slug: meta.slug });
      this.wsServer.broadcast({
        type: "session:updated",
        sessionId,
        filePath,
        timestamp: Date.now(),
        ...meta,
      });
    });

    this.watcher.on("add", (filePath: string) => {
      const sessionId = path.basename(filePath, ".jsonl");
      const meta = extractSessionMeta(filePath);
      watcherLog.debug("session created", { sessionId });
      this.wsServer.broadcast({
        type: "session:created",
        sessionId,
        filePath,
        timestamp: Date.now(),
        ...meta,
      });
    });

    this.watcher.on("unlink", (filePath: string) => {
      const sessionId = path.basename(filePath, ".jsonl");
      watcherLog.debug("session deleted", { sessionId });
      this.wsServer.broadcast({
        type: "session:deleted",
        sessionId,
        filePath,
        timestamp: Date.now(),
      });
    });

    watcherLog.info("session watcher started");
  }

  stop() {
    this.watcher?.close();
  }
}
