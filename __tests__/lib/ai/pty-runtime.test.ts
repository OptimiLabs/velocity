import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();

vi.mock("node-pty", () => ({
  spawn: spawnMock,
}));

describe("pty-runtime", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("resolves platform-specific command candidates", async () => {
    const { resolveCliCommandCandidates } = await import("@/lib/ai/pty-runtime");

    expect(resolveCliCommandCandidates("claude", "darwin")).toEqual(["claude"]);
    expect(resolveCliCommandCandidates("codex", "linux")).toEqual(["codex"]);
    expect(resolveCliCommandCandidates("claude", "win32")).toEqual([
      "claude.cmd",
      "claude.exe",
      "claude",
    ]);
  });

  it("uses platform-aware terminal names", async () => {
    const { resolveTermName } = await import("@/lib/ai/pty-runtime");

    expect(resolveTermName("win32")).toBe("xterm-color");
    expect(resolveTermName("linux")).toBe("xterm-256color");
  });

  it("writes EOF based on platform", async () => {
    const { writePromptAndEof } = await import("@/lib/ai/pty-runtime");
    const write = vi.fn();
    const term = { write } as unknown as import("node-pty").IPty;

    writePromptAndEof(term, "hello", "linux");
    expect(write.mock.calls).toEqual([
      ["hello"],
      ["\x04"],
    ]);

    write.mockClear();
    writePromptAndEof(term, "hello", "win32");
    expect(write.mock.calls).toEqual([
      ["hello"],
      ["\x1a\r"],
    ]);
  });

  it("falls back through Windows command candidates when spawning", async () => {
    const fakeTerm = { pid: 1 };
    spawnMock
      .mockImplementationOnce(() => {
        throw new Error("not found");
      })
      .mockReturnValueOnce(fakeTerm);

    const { spawnCliPty } = await import("@/lib/ai/pty-runtime");
    const spawned = spawnCliPty(
      "claude",
      ["--print", "hi"],
      {
        cols: 120,
        rows: 40,
        cwd: "/tmp",
        env: {},
      },
      "win32",
    );

    expect(spawned).toBe(fakeTerm);
    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      "claude.cmd",
      ["--print", "hi"],
      expect.objectContaining({ name: "xterm-color" }),
    );
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      "claude.exe",
      ["--print", "hi"],
      expect.objectContaining({ name: "xterm-color" }),
    );
  });
});
