import { afterEach, describe, expect, it, vi } from "vitest";
import type { CachedTerminal } from "@/lib/console/terminal-cache";
import {
  MAX_CACHED_TERMINALS,
  cacheTerminalDom,
  clearSerializedBuffer,
  serializedBuffers,
  takeSerializedBuffer,
  terminalDomCache,
} from "@/lib/console/terminal-cache";

function makeCached(serialized: string): CachedTerminal {
  return {
    wrapper: document.createElement("div"),
    term: {
      dispose: vi.fn(),
    } as unknown as CachedTerminal["term"],
    fitAddon: {} as CachedTerminal["fitAddon"],
    serializeAddon: {
      serialize: () => serialized,
    } as unknown as CachedTerminal["serializeAddon"],
    searchAddon: {} as CachedTerminal["searchAddon"],
  };
}

afterEach(() => {
  terminalDomCache.clear();
  for (const key of serializedBuffers.keys()) {
    clearSerializedBuffer(key);
  }
});

describe("terminal-cache", () => {
  it("snapshots evicted DOM cache entries into serialized buffer cache", () => {
    const firstId = "term-0";
    cacheTerminalDom(firstId, makeCached("first-snapshot"));

    for (let i = 1; i <= MAX_CACHED_TERMINALS; i += 1) {
      cacheTerminalDom(`term-${i}`, makeCached(`snapshot-${i}`));
    }

    expect(terminalDomCache.has(firstId)).toBe(false);
    expect(takeSerializedBuffer(firstId)).toBe("first-snapshot");
  });

  it("snapshots old instance when the same terminal id is replaced", () => {
    const id = "term-1";
    cacheTerminalDom(id, makeCached("old-instance"));
    cacheTerminalDom(id, makeCached("new-instance"));

    expect(takeSerializedBuffer(id)).toBe("old-instance");
    expect(terminalDomCache.has(id)).toBe(true);
  });
});
