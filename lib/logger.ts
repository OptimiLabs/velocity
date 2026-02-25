/**
 * Centralized logger — zero-dependency console wrapper with structured output.
 *
 * Usage:
 *   import { mcpLog } from "@/lib/logger";
 *   mcpLog.info("connecting", { server: name });
 *   mcpLog.error("discovery failed", err, { server: name });
 *
 * Format: [HH:MM:SS.mmm] [PREFIX] [LEVEL] message { context }
 * Level controlled by LOG_LEVEL env var (default: "info").
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogPrefix =
  | "MCP"
  | "PTY"
  | "WS"
  | "DB"
  | "INDEXER"
  | "CONSOLE"
  | "SKILL"
  | "WATCHER"
  | "ROUTING"
  | "API"
  | "AI"
  | "CLEANUP";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): number {
  const env =
    typeof process !== "undefined"
      ? (process.env?.LOG_LEVEL?.toLowerCase() as LogLevel | undefined)
      : undefined;
  return LEVEL_ORDER[env ?? "info"] ?? LEVEL_ORDER.info;
}

function timestamp(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function formatContext(ctx?: Record<string, unknown>): string {
  if (!ctx || Object.keys(ctx).length === 0) return "";
  try {
    return " " + JSON.stringify(ctx);
  } catch {
    return "";
  }
}

function extractError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const out: Record<string, unknown> = { message: err.message };
    if (err.stack) {
      // Only include first 3 stack frames to keep output concise
      const frames = err.stack.split("\n").slice(1, 4).join("\n");
      out.stack = frames;
    }
    if ((err as NodeJS.ErrnoException).code) {
      out.code = (err as NodeJS.ErrnoException).code;
    }
    return out;
  }
  return { message: String(err) };
}

interface Logger {
  debug(msg: string, errOrCtx?: unknown, ctx?: Record<string, unknown>): void;
  info(msg: string, errOrCtx?: unknown, ctx?: Record<string, unknown>): void;
  warn(msg: string, errOrCtx?: unknown, ctx?: Record<string, unknown>): void;
  error(msg: string, errOrCtx?: unknown, ctx?: Record<string, unknown>): void;
}

function createLogger(prefix: LogPrefix): Logger {
  const tag = `[${prefix}]`;

  function log(
    level: LogLevel,
    msg: string,
    errOrCtx?: unknown,
    ctx?: Record<string, unknown>,
  ): void {
    if (LEVEL_ORDER[level] < getMinLevel()) return;

    const ts = timestamp();
    const lvl = `[${level.toUpperCase()}]`;

    // Disambiguate the second arg based on call pattern:
    // - 3-arg call (ctx provided): errOrCtx is always an error/error-like value
    // - 2-arg call (ctx undefined): for debug/info it's context, for warn/error use heuristic
    let errInfo = "";
    let context = ctx;
    if (ctx !== undefined) {
      // Explicit 3-arg call: second arg is an error
      if (errOrCtx != null) {
        const extracted = extractError(errOrCtx);
        errInfo = ` — ${extracted.message}`;
        context = { ...extracted, ...ctx };
      }
    } else if (level === "warn" || level === "error") {
      // 2-arg warn/error: heuristic — Error/string = error, plain object = context
      if (
        errOrCtx instanceof Error ||
        (errOrCtx && typeof errOrCtx !== "object")
      ) {
        const extracted = extractError(errOrCtx);
        errInfo = ` — ${extracted.message}`;
        context = extracted;
      } else if (errOrCtx && typeof errOrCtx === "object") {
        context = errOrCtx as Record<string, unknown>;
      }
    } else {
      // 2-arg debug/info: second arg is always context
      context = errOrCtx as Record<string, unknown> | undefined;
    }

    const contextStr = formatContext(context);
    const line = `${ts} ${tag} ${lvl} ${msg}${errInfo}${contextStr}`;

    switch (level) {
      case "debug":
        console.debug(line);
        break;
      case "info":
        console.log(line);
        break;
      case "warn":
        console.warn(line);
        break;
      case "error":
        console.error(line);
        break;
    }
  }

  return {
    debug: (msg, errOrCtx?, ctx?) => log("debug", msg, errOrCtx, ctx),
    info: (msg, errOrCtx?, ctx?) => log("info", msg, errOrCtx, ctx),
    warn: (msg, errOrCtx?, ctx?) => log("warn", msg, errOrCtx, ctx),
    error: (msg, errOrCtx?, ctx?) => log("error", msg, errOrCtx, ctx),
  };
}

// Pre-exported instances for each subsystem
export const mcpLog = createLogger("MCP");
export const ptyLog = createLogger("PTY");
export const wsLog = createLogger("WS");
export const dbLog = createLogger("DB");
export const indexerLog = createLogger("INDEXER");
export const consoleLog = createLogger("CONSOLE");
export const watcherLog = createLogger("WATCHER");
export const routingLog = createLogger("ROUTING");
export const apiLog = createLogger("API");
export const aiLog = createLogger("AI");
export const skillLog = createLogger("SKILL");
export const cleanupLog = createLogger("CLEANUP");
