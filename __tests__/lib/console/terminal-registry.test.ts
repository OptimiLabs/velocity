import { afterEach, describe, expect, it } from "vitest";
import {
  clearTerminalBuffer,
  dispatchPtyMessage,
  registerTerminalHandler,
  unregisterTerminalHandler,
} from "@/lib/console/terminal-registry";

afterEach(() => {
  clearTerminalBuffer("term-1");
  unregisterTerminalHandler("term-1");
});

describe("terminal-registry", () => {
  it("preserves pending coalesced output across unregister/register", async () => {
    const firstHandlerEvents: Array<{ type: string; data?: string }> = [];
    const secondHandlerEvents: Array<{ type: string; data?: string }> = [];

    registerTerminalHandler("term-1", (msg) => {
      firstHandlerEvents.push({ type: msg.type, data: msg.data });
    });

    dispatchPtyMessage({
      type: "pty:output",
      terminalId: "term-1",
      data: "hello",
    });

    // Simulate fast unmount before coalesced rAF flush.
    unregisterTerminalHandler("term-1");

    registerTerminalHandler("term-1", (msg) => {
      secondHandlerEvents.push({ type: msg.type, data: msg.data });
    });

    expect(firstHandlerEvents).toHaveLength(0);
    expect(secondHandlerEvents).toEqual([
      { type: "pty:output", data: "hello" },
    ]);

    // Let any queued rAF timers run and verify no duplicate replay.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(secondHandlerEvents).toHaveLength(1);
  });
});
