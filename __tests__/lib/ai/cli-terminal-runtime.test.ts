import { beforeEach, describe, expect, it, vi } from "vitest";

type ExitPayload = { exitCode: number; signal?: number };

interface MockPty {
  pid: number;
  write: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  onData: (cb: (data: string) => void) => { dispose: () => void };
  onExit: (cb: (payload: ExitPayload) => void) => { dispose: () => void };
}

const killProcessMock = vi.fn();

vi.mock("@/lib/platform", () => ({
  killProcess: killProcessMock,
}));

const ptyRuntimeMock = {
  spawnCliPty: vi.fn(),
  writePromptAndEof: vi.fn(),
};

vi.mock("@/lib/ai/pty-runtime", () => ptyRuntimeMock);

function createMockPty(): {
  pty: MockPty;
  emitData: (data: string) => void;
  emitExit: (exitCode: number) => void;
} {
  let onData: ((data: string) => void) | undefined;
  let onExit: ((payload: ExitPayload) => void) | undefined;
  const pty: MockPty = {
    pid: 4242,
    write: vi.fn(),
    kill: vi.fn(),
    onData(cb) {
      onData = cb;
      return { dispose: () => {} };
    },
    onExit(cb) {
      onExit = cb;
      return { dispose: () => {} };
    },
  };
  return {
    pty,
    emitData: (data) => onData?.(data),
    emitExit: (exitCode) => onExit?.({ exitCode }),
  };
}

describe("CLI terminal runtime wrappers", () => {
  beforeEach(() => {
    killProcessMock.mockReset();
    ptyRuntimeMock.spawnCliPty.mockReset();
    ptyRuntimeMock.writePromptAndEof.mockReset();
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_API_KEY;
    delete process.env.KEEP_TEST_ENV;
  });

  it("claudeOneShot passes prompt as CLI arg in print mode", async () => {
    const { pty, emitData, emitExit } = createMockPty();
    ptyRuntimeMock.spawnCliPty.mockReturnValue(pty);
    process.env.CLAUDECODE = "nested";
    process.env.CLAUDE_API_KEY = "keep-me";
    process.env.KEEP_TEST_ENV = "1";

    const { claudeOneShot } = await import("@/lib/ai/claude");
    const promise = claudeOneShot(
      "hello from test",
      "/tmp",
      5_000,
      "claude-sonnet-4-6",
      "high",
    );

    emitData("output line\r\n");
    emitExit(0);
    const result = await promise;

    expect(result).toBe("output line");
    expect(ptyRuntimeMock.spawnCliPty).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining([
        "--model",
        "claude-sonnet-4-6",
        "--print",
        "hello from test",
      ]),
      expect.objectContaining({
        cwd: "/tmp",
        env: expect.objectContaining({
          FORCE_COLOR: "0",
          CLAUDE_CODE_EFFORT_LEVEL: "high",
          KEEP_TEST_ENV: "1",
        }),
      }),
    );
    const spawnEnv = ptyRuntimeMock.spawnCliPty.mock.calls[0]?.[2]
      ?.env as Record<string, string>;
    expect(spawnEnv.CLAUDE_API_KEY).toBe("keep-me");
    expect(spawnEnv.CLAUDECODE).toBeUndefined();
    expect(pty.write).not.toHaveBeenCalled();
    expect(ptyRuntimeMock.writePromptAndEof).not.toHaveBeenCalled();
  });

  it("codexOneShot spawns a PTY terminal and writes prompt + EOF", async () => {
    const { pty, emitData, emitExit } = createMockPty();
    ptyRuntimeMock.spawnCliPty.mockReturnValue(pty);

    const { codexOneShot } = await import("@/lib/ai/codex");
    const promise = codexOneShot("build a plan", "/tmp", 5_000, {
      model: "gpt-5.3-codex",
      effort: "medium",
    });

    emitData("codex result\r\n");
    emitExit(0);
    const result = await promise;

    expect(result).toBe("codex result");
    expect(ptyRuntimeMock.spawnCliPty).toHaveBeenCalledWith(
      "codex",
      expect.arrayContaining([
        "exec",
        "--ephemeral",
        "--color",
        "never",
        "--model",
        "gpt-5.3-codex",
      ]),
      expect.objectContaining({
        cwd: "/tmp",
        env: expect.objectContaining({
          FORCE_COLOR: "0",
        }),
      }),
    );
    expect(ptyRuntimeMock.writePromptAndEof).toHaveBeenCalledWith(
      pty,
      "build a plan",
    );
  });
});
