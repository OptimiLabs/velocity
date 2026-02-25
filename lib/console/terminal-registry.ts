/**
 * Terminal output callback registry.
 *
 * Each terminal ID maps to exactly one handler via Map.set().
 * This guarantees no duplicate handlers — unlike addEventListener,
 * calling register() twice for the same ID silently replaces the
 * previous handler, making this immune to HMR listener leaks.
 *
 * When a terminal is unmounted (e.g. during group switch), output
 * arriving via WebSocket is buffered per-terminal. On remount,
 * the buffer is flushed to the new handler so scrollback is preserved.
 *
 * Write coalescing: pty:output messages are not dispatched immediately.
 * Instead, data strings are buffered per-terminal and flushed once per
 * animation frame (via requestAnimationFrame), or immediately when the
 * buffer exceeds 64KB. Non-output messages bypass coalescing entirely
 * and also trigger a flush of any pending output buffer.
 */

import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";

type PtyMessage = {
  type: string;
  terminalId: string;
  data?: string;
  exitCode?: number;
  reclaimed?: boolean;
};
type PtyHandler = (msg: PtyMessage) => void;

const MAX_BUFFER_BYTES = 256 * 1024; // 256KB per terminal (offline buffer)
const MAX_TOTAL_OFFLINE_BUFFER_BYTES = 8 * 1024 * 1024; // 8MB global cap
const COALESCE_FLUSH_BYTES = 64 * 1024; // 64KB threshold for immediate coalesce flush
const ACTIVITY_META_THROTTLE_MS = 2_000;

const handlers = new Map<string, PtyHandler>();
const buffers = new Map<string, { chunks: PtyMessage[]; bytes: number }>();
const activityMetaUpdateAt = new Map<string, number>();
let totalOfflineBufferedBytes = 0;

// --- Write coalescing state ---
// Per-terminal pending output data waiting for the next animation frame flush.
const coalesceBuffers = new Map<string, string>();
let coalesceRafId: number | null = null;
// Set of terminal IDs that have pending coalesced data.
const coalescePending = new Set<string>();

/** Flush coalesced output for a single terminal. */
function flushCoalesceBuffer(terminalId: string) {
  const data = coalesceBuffers.get(terminalId);
  if (!data) return;
  coalesceBuffers.delete(terminalId);
  coalescePending.delete(terminalId);

  const handler = handlers.get(terminalId);
  if (handler) {
    handler({ type: "pty:output", terminalId, data });
  }
}

/** Flush all pending coalesce buffers (called from rAF callback). */
function flushAllCoalesceBuffers() {
  coalesceRafId = null;
  // Iterate over a snapshot so mutations during flush are safe.
  const ids = Array.from(coalescePending);
  for (const id of ids) {
    flushCoalesceBuffer(id);
  }
}

/** Schedule an animation-frame flush if one isn't already pending. */
function scheduleCoalesceFlush() {
  if (coalesceRafId === null && typeof requestAnimationFrame !== "undefined") {
    coalesceRafId = requestAnimationFrame(flushAllCoalesceBuffers);
  }
}

/** Evict oldest offline buffers until under global cap. */
function evictOfflineBuffersToCap() {
  while (
    totalOfflineBufferedBytes > MAX_TOTAL_OFFLINE_BUFFER_BYTES &&
    buffers.size > 0
  ) {
    const oldestId = buffers.keys().next().value as string | undefined;
    if (!oldestId) break;
    const oldest = buffers.get(oldestId);
    if (oldest) totalOfflineBufferedBytes -= oldest.bytes;
    buffers.delete(oldestId);
  }
}

export function registerTerminalHandler(id: string, handler: PtyHandler) {
  handlers.set(id, handler);
  // Flush any buffered messages that arrived while no handler was registered
  const buf = buffers.get(id);
  if (buf) {
    if (buf.chunks.length > 0) {
      for (const msg of buf.chunks) handler(msg);
    }
    totalOfflineBufferedBytes -= buf.bytes;
    buffers.delete(id);
  }
  // Also flush any pending coalesced output for this terminal
  flushCoalesceBuffer(id);
}

export function unregisterTerminalHandler(id: string) {
  handlers.delete(id);
  // Discard any pending coalesced output — there's no handler to receive it,
  // and the offline buffer system will capture new data going forward.
  coalesceBuffers.delete(id);
  coalescePending.delete(id);
  // Don't clear offline buffer — it may be needed when a new handler registers on remount
}

/** Called from useMultiConsole's ws.onmessage for every PTY message. */
export function dispatchPtyMessage(msg: PtyMessage) {
  const handler = handlers.get(msg.terminalId);

  if (handler) {
    if (msg.type === "pty:output" && msg.data) {
      // Coalesce output: append to the per-terminal buffer
      const existing = coalesceBuffers.get(msg.terminalId) ?? "";
      const combined = existing + msg.data;
      coalesceBuffers.set(msg.terminalId, combined);
      coalescePending.add(msg.terminalId);

      // Immediate flush if buffer exceeds 64KB
      if (combined.length >= COALESCE_FLUSH_BYTES) {
        flushCoalesceBuffer(msg.terminalId);
      } else {
        scheduleCoalesceFlush();
      }
    } else {
      // Non-output message: flush any pending output first, then dispatch immediately
      flushCoalesceBuffer(msg.terminalId);
      handler(msg);
    }
  } else if (msg.type === "pty:output" && msg.data) {
    // Buffer output for terminals without a handler (e.g., unmounted during group switch)
    let buf = buffers.get(msg.terminalId);
    if (!buf) {
      buf = { chunks: [], bytes: 0 };
      buffers.set(msg.terminalId, buf);
    }
    const availableBytes = MAX_BUFFER_BYTES - buf.bytes;
    if (availableBytes > 0) {
      const data =
        msg.data.length > availableBytes
          ? msg.data.slice(0, availableBytes)
          : msg.data;
      if (data.length > 0) {
        const payload = data === msg.data ? msg : { ...msg, data };
        buf.chunks.push(payload);
        buf.bytes += data.length;
        totalOfflineBufferedBytes += data.length;
        evictOfflineBuffersToCap();
      }
    }
    // Mark unseen activity for background terminals
    try {
      const now = Date.now();
      const last = activityMetaUpdateAt.get(msg.terminalId) ?? 0;
      if (now - last >= ACTIVITY_META_THROTTLE_MS) {
        activityMetaUpdateAt.set(msg.terminalId, now);
        const store = useConsoleLayoutStore.getState();
        store.updateTerminalMeta(msg.terminalId, {
          hasActivity: true,
          lastOutputAt: now,
        });
      }
    } catch {
      // Store may not be initialized yet
    }
  }
}

/** Clean up buffer when a terminal is permanently closed (not just group-switched). */
export function clearTerminalBuffer(id: string) {
  const buf = buffers.get(id);
  if (buf) totalOfflineBufferedBytes -= buf.bytes;
  buffers.delete(id);
  coalesceBuffers.delete(id);
  coalescePending.delete(id);
  activityMetaUpdateAt.delete(id);
}
