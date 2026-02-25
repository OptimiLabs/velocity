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

/** Module-level cache for serialized terminal buffers across unmount/remount cycles */
export const serializedBuffers = new Map<string, string>();

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

/** Clear a serialized buffer when a terminal is permanently closed */
export function clearSerializedBuffer(id: string) {
  serializedBuffers.delete(id);
}

/** Clear prompt tracker when a terminal is permanently closed */
export function clearPromptTracker(id: string) {
  promptTrackers.delete(id);
}
