import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { PtyHandler } from "@/server/handlers/pty-handler";
import type { PtyManager } from "@/server/pty-manager";

function createPtyManagerStub(overrides: Partial<PtyManager> = {}): PtyManager {
  return {
    write: vi.fn(),
    resolveRuntimeCwd: vi.fn(async () => null),
    getTrackedCwd: vi.fn(() => null),
    setTrackedCwd: vi.fn(),
    ...overrides,
  } as unknown as PtyManager;
}

describe("PtyHandler cwd tracking fallback", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("probes runtime cwd on newline input and emits cwd-change when changed", async () => {
    vi.useFakeTimers();
    const ws = {} as WebSocket;
    const sendTo = vi.fn();
    const ptyManager = createPtyManagerStub({
      resolveRuntimeCwd: vi.fn(async () => "/tmp/new"),
      getTrackedCwd: vi.fn(() => "/tmp/old"),
    });
    const handler = new PtyHandler({ sendTo, ptyManager });

    handler.handleInput(ws, { terminalId: "term-1", data: "\r" });
    await vi.advanceTimersByTimeAsync(200);

    expect(ptyManager.write).toHaveBeenCalledWith("term-1", "\r");
    expect(ptyManager.resolveRuntimeCwd).toHaveBeenCalledWith("term-1");
    expect(ptyManager.setTrackedCwd).toHaveBeenCalledWith("term-1", "/tmp/new");
    expect(sendTo).toHaveBeenCalledWith(ws, {
      type: "pty:cwd-change",
      terminalId: "term-1",
      cwd: "/tmp/new",
    });
  });

  it("does not probe cwd when input has no newline", async () => {
    vi.useFakeTimers();
    const ws = {} as WebSocket;
    const sendTo = vi.fn();
    const ptyManager = createPtyManagerStub();
    const handler = new PtyHandler({ sendTo, ptyManager });

    handler.handleInput(ws, { terminalId: "term-2", data: "ls -la" });
    await vi.advanceTimersByTimeAsync(500);

    expect(ptyManager.write).toHaveBeenCalledWith("term-2", "ls -la");
    expect(ptyManager.resolveRuntimeCwd).not.toHaveBeenCalled();
    expect(sendTo).not.toHaveBeenCalledWith(
      ws,
      expect.objectContaining({ type: "pty:cwd-change" }),
    );
  });

  it("forwards logging preference when spawning a PTY", () => {
    const ws = {} as WebSocket;
    const sendTo = vi.fn();
    const ptyManager = createPtyManagerStub({
      has: vi.fn(() => false),
      create: vi.fn(),
      reclaimForClient: vi.fn(),
      setDataHandler: vi.fn(),
      setExitHandler: vi.fn(),
      getTrackedCwd: vi.fn(() => null),
    });
    const handler = new PtyHandler({ sendTo, ptyManager });

    handler.handleCreate(ws, { terminalId: "term-3", cwd: "/tmp", logging: true });

    expect(ptyManager.create).toHaveBeenCalledWith(
      "term-3",
      "/tmp",
      80,
      24,
      undefined,
      undefined,
      undefined,
      true,
    );
    expect(sendTo).toHaveBeenCalledWith(ws, {
      type: "pty:created",
      terminalId: "term-3",
      reclaimed: false,
    });
  });
});
