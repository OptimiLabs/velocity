import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";

const spawnMock = vi.fn();
const execFileSyncMock = vi.fn();

vi.mock("node-pty", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

vi.mock("child_process", async () => {
  const actual = await vi.importActual<typeof import("child_process")>(
    "child_process",
  );
  return {
    ...actual,
    execFileSync: (...args: unknown[]) => execFileSyncMock(...args),
  };
});

import { PtyManager } from "@/server/pty-manager";

function createFakePty() {
  const dataHandlers: Array<(data: string) => void> = [];
  const exitHandlers: Array<(event: { exitCode: number }) => void> = [];

  const fake = {
    pid: 43210,
    cols: 80,
    rows: 24,
    write: vi.fn(),
    resize: vi.fn((cols: number, rows: number) => {
      fake.cols = cols;
      fake.rows = rows;
    }),
    kill: vi.fn(),
    onData: vi.fn((cb: (data: string) => void) => {
      dataHandlers.push(cb);
      return { dispose: vi.fn() };
    }),
    onExit: vi.fn((cb: (event: { exitCode: number }) => void) => {
      exitHandlers.push(cb);
      return { dispose: vi.fn() };
    }),
    emitData: (data: string) => {
      for (const handler of dataHandlers) handler(data);
    },
    emitExit: (exitCode: number) => {
      for (const handler of exitHandlers) handler({ exitCode });
    },
  };

  return fake;
}

describe("PtyManager tmux persistence", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    execFileSyncMock.mockReset();
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "-V") return "tmux 3.4";
      if (args[0] === "list-sessions") return "";
      if (args[0] === "kill-session") return "";
      return "";
    });
  });

  it("uses tmux new-session for indefinite persistence", () => {
    const fakePty = createFakePty();
    spawnMock.mockReturnValue(fakePty);
    const manager = new PtyManager();
    manager.setOrphanTimeout(0);

    manager.create("term-abc", "/tmp", 120, 40);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      "tmux",
      expect.arrayContaining(["new-session", "-A", "-s"]),
      expect.objectContaining({ cwd: "/tmp", cols: 120, rows: 40 }),
    );
    const tmuxArgs = spawnMock.mock.calls[0]?.[1] as string[];
    expect(tmuxArgs[3]).toContain("term-abc");
  });

  it("kills managed tmux session when terminal is explicitly closed", () => {
    const fakePty = createFakePty();
    spawnMock.mockReturnValue(fakePty);
    const manager = new PtyManager();
    manager.setOrphanTimeout(0);

    manager.create("term-close", "/tmp", 80, 24);
    const sessionName = (spawnMock.mock.calls[0]?.[1] as string[])[3];

    execFileSyncMock.mockClear();
    manager.close("term-close");

    expect(execFileSyncMock).toHaveBeenCalledWith(
      "tmux",
      ["kill-session", "-t", sessionName],
      expect.any(Object),
    );
  });

  it("prunes stale managed tmux sessions missing from active terminal sync", () => {
    const prefix = `velocity-${createHash("sha1")
      .update(process.cwd())
      .digest("hex")
      .slice(0, 8)}-`;
    const keepSession = `${prefix}term_keep`;
    const staleSession = `${prefix}term_stale`;

    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "-V") return "tmux 3.4";
      if (args[0] === "list-sessions") {
        return `${keepSession}\n${staleSession}\nnot-managed\n`;
      }
      if (args[0] === "kill-session") return "";
      return "";
    });

    const manager = new PtyManager();
    manager.syncActiveTerminals(["term_keep"]);

    expect(execFileSyncMock).toHaveBeenCalledWith(
      "tmux",
      ["kill-session", "-t", staleSession],
      expect.any(Object),
    );
    expect(execFileSyncMock).not.toHaveBeenCalledWith(
      "tmux",
      ["kill-session", "-t", keepSession],
      expect.any(Object),
    );
  });

  it("detaches tmux-backed orphan immediately in indefinite mode", () => {
    const fakePty = createFakePty();
    spawnMock.mockReturnValue(fakePty);
    const manager = new PtyManager();
    manager.setOrphanTimeout(0);

    manager.create("term-detach", "/tmp", 80, 24);
    manager.setOwner("term-detach", {} as WebSocket);
    manager.orphanForClient({} as WebSocket);

    // Different ws object should not orphan
    expect(manager.has("term-detach")).toBe(true);

    const ws = {} as WebSocket;
    manager.setOwner("term-detach", ws);
    manager.orphanForClient(ws);

    expect(fakePty.kill).toHaveBeenCalledTimes(1);
    expect(manager.has("term-detach")).toBe(false);
    expect(execFileSyncMock).not.toHaveBeenCalledWith(
      "tmux",
      ["kill-session", "-t", expect.stringContaining("term-detach")],
      expect.any(Object),
    );
  });

  it("cleans up session map when PTY exits naturally", () => {
    const fakePty = createFakePty();
    spawnMock.mockReturnValue(fakePty);
    const manager = new PtyManager();
    const died = vi.fn();
    manager.setOnPtyDied(died);

    manager.create("term-exit", "/tmp", 80, 24);
    expect(manager.has("term-exit")).toBe(true);

    fakePty.emitExit(0);

    expect(manager.has("term-exit")).toBe(false);
    expect(died).toHaveBeenCalledWith("term-exit");
  });

  it("does not retain orphan entries across repeated tmux detach cycles", () => {
    spawnMock.mockImplementation(() => {
      const fake = createFakePty();
      fake.pid = 0;
      return fake;
    });
    const manager = new PtyManager();
    manager.setOrphanTimeout(0);
    const ws = {} as WebSocket;

    for (let i = 0; i < 40; i += 1) {
      const id = `term-cycle-${i}`;
      manager.create(id, "/tmp", 80, 24);
      manager.setOwner(id, ws);
      manager.orphanForClient(ws);
      expect(manager.has(id)).toBe(false);
    }
  });
});
