import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import type { SerializeAddon } from "@xterm/addon-serialize";
import type { SearchAddon } from "@xterm/addon-search";
import { PromptMarkTracker } from "@/lib/console/prompt-marks";

/** Cached terminal DOM instance — survives pane tree restructuring without disposing */
export interface CachedTerminal {
  wrapper: HTMLDivElement;
  term: Terminal;
  fitAddon: FitAddon;
  serializeAddon: SerializeAddon;
  searchAddon: SearchAddon;
}

export const MAX_SERIALIZE_BYTES = 512 * 1024; // 512KB cap per terminal
export const MAX_SERIALIZED_TERMINALS = 30;
export const MAX_TOTAL_SERIALIZED_BYTES = 6 * 1024 * 1024; // 6MB cap across all terminals
export const MAX_CACHED_TERMINALS = 16;

/** Module-level cache for serialized terminal buffers across unmount/remount cycles */
export const serializedBuffers = new Map<string, string>();
let serializedBytesTotal = 0;

/** Module-level DOM cache — reparent terminals without disposing xterm instances */
export const terminalDomCache = new Map<string, CachedTerminal>();

/** Module-level map of prompt mark trackers (OSC 133) per terminal */
export const promptTrackers = new Map<string, PromptMarkTracker>();

/** Dispose a cached terminal instance (call on explicit close only) */
export function disposeTerminalDomCache(terminalId: string) {
  const cached = terminalDomCache.get(terminalId);
  if (cached) {
    cached.term.dispose();
    cached.wrapper.remove();
    terminalDomCache.delete(terminalId);
  }
}

/**
 * Insert a terminal into the DOM cache with LRU-style eviction.
 * Keeps memory bounded when many terminals/groups are toggled.
 */
export function cacheTerminalDom(terminalId: string, cached: CachedTerminal) {
  const existing = terminalDomCache.get(terminalId);
  if (existing) {
    existing.term.dispose();
    existing.wrapper.remove();
    terminalDomCache.delete(terminalId);
  }
  terminalDomCache.set(terminalId, cached);

  while (terminalDomCache.size > MAX_CACHED_TERMINALS) {
    const oldestId = terminalDomCache.keys().next().value as string | undefined;
    if (!oldestId) break;
    const oldest = terminalDomCache.get(oldestId);
    if (oldest) {
      oldest.term.dispose();
      oldest.wrapper.remove();
    }
    terminalDomCache.delete(oldestId);
  }
}

/** Take (get + delete) a cached terminal for reuse. */
export function takeCachedTerminal(
  terminalId: string,
): CachedTerminal | undefined {
  const cached = terminalDomCache.get(terminalId);
  if (!cached) return undefined;
  terminalDomCache.delete(terminalId);
  return cached;
}

/**
 * Store serialized scrollback with bounded memory.
 * Keeps insertion order (LRU-ish) by moving updates to the end.
 */
export function setSerializedBuffer(terminalId: string, data: string): boolean {
  if (!data || data.length > MAX_SERIALIZE_BYTES) return false;

  const prev = serializedBuffers.get(terminalId);
  if (prev !== undefined) {
    serializedBytesTotal -= prev.length;
    serializedBuffers.delete(terminalId);
  }

  serializedBuffers.set(terminalId, data);
  serializedBytesTotal += data.length;

  while (
    serializedBuffers.size > MAX_SERIALIZED_TERMINALS ||
    serializedBytesTotal > MAX_TOTAL_SERIALIZED_BYTES
  ) {
    const oldestId = serializedBuffers.keys().next().value as string | undefined;
    if (!oldestId) break;
    const oldest = serializedBuffers.get(oldestId);
    if (oldest !== undefined) serializedBytesTotal -= oldest.length;
    serializedBuffers.delete(oldestId);
  }

  return true;
}

/** Take (get + delete) a serialized scrollback payload. */
export function takeSerializedBuffer(terminalId: string): string | undefined {
  const data = serializedBuffers.get(terminalId);
  if (data === undefined) return undefined;
  serializedBuffers.delete(terminalId);
  serializedBytesTotal -= data.length;
  return data;
}

/** Clear a serialized buffer when a terminal is permanently closed */
export function clearSerializedBuffer(id: string) {
  const existing = serializedBuffers.get(id);
  if (existing !== undefined) serializedBytesTotal -= existing.length;
  serializedBuffers.delete(id);
}

/** Clear prompt tracker when a terminal is permanently closed */
export function clearPromptTracker(id: string) {
  promptTrackers.delete(id);
}
