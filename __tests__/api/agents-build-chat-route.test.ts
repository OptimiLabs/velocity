import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockProc = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
};

const spawnMock = vi.fn();
const aiGenerateMock = vi.fn();

vi.mock("child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("@/lib/ai/generate", () => ({
  aiGenerate: aiGenerateMock,
}));

function createMockProc(): MockProc {
  const proc = new EventEmitter() as MockProc;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killed = false;
  proc.kill = vi.fn((signal?: string) => {
    proc.killed = true;
    queueMicrotask(() => {
      proc.emit("close", signal === "SIGTERM" ? 143 : 0);
    });
    return true;
  });
  return proc;
}

function parseSse(raw: string): Array<{ type?: string; data?: string }> {
  return raw
    .split("\n\n")
    .map((chunk) =>
      chunk
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice(6),
    )
    .filter((v): v is string => Boolean(v))
    .map((line) => JSON.parse(line));
}

describe("POST /api/agents/build-chat (route)", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    aiGenerateMock.mockReset();
  });

  it("rejects invalid message payloads", async () => {
    const { POST } = await import("@/app/api/agents/build-chat/route");
    const req = new Request("http://localhost/api/agents/build-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "system", content: "nope" }] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "messages required" });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("streams delta text and does not duplicate final result payload", async () => {
    const proc = createMockProc();
    spawnMock.mockImplementationOnce(() => {
      queueMicrotask(() => {
        // Deliberately split across chunks to exercise stream buffering.
        proc.stdout.emit(
          "data",
          Buffer.from(
            '{"type":"content_block_delta","delta":{"text":"Hello"}}\n{"type":"content_b',
          ),
        );
        proc.stdout.emit(
          "data",
          Buffer.from(
            'lock_delta","delta":{"text":" world"}}\n{"type":"result","result":"Hello world"}\n',
          ),
        );
        proc.emit("close", 0);
      });
      return proc;
    });

    const { POST } = await import("@/app/api/agents/build-chat/route");
    const req = new Request("http://localhost/api/agents/build-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Build me an agent" }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const events = parseSse(await res.text());
    const textEvents = events.filter((e) => e.type === "text");
    const doneEvents = events.filter((e) => e.type === "done");

    expect(textEvents.map((e) => e.data)).toEqual(["Hello", " world"]);
    expect(doneEvents).toHaveLength(1);
  });

  it("falls back to final result event when no deltas are emitted", async () => {
    const proc = createMockProc();
    spawnMock.mockImplementationOnce(() => {
      queueMicrotask(() => {
        proc.stdout.emit(
          "data",
          Buffer.from('{"type":"result","result":"Only final output"}\n'),
        );
        proc.emit("close", 0);
      });
      return proc;
    });

    const { POST } = await import("@/app/api/agents/build-chat/route");
    const req = new Request("http://localhost/api/agents/build-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Help me design an agent" }],
      }),
    });

    const res = await POST(req);
    const events = parseSse(await res.text());
    expect(events).toEqual([
      { type: "text", data: "Only final output" },
      { type: "done" },
    ]);
  });

  it("forwards stderr error lines and still closes the stream", async () => {
    const proc = createMockProc();
    spawnMock.mockImplementationOnce(() => {
      queueMicrotask(() => {
        proc.stderr.emit("data", Buffer.from("Error: CLI failed to initialize"));
        proc.emit("close", 1);
      });
      return proc;
    });

    const { POST } = await import("@/app/api/agents/build-chat/route");
    const req = new Request("http://localhost/api/agents/build-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Build me an agent" }],
      }),
    });

    const res = await POST(req);
    const events = parseSse(await res.text());

    expect(events.some((e) => e.type === "error")).toBe(true);
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("kills the child process when the response stream is canceled", async () => {
    const proc = createMockProc();
    spawnMock.mockImplementationOnce(() => proc);

    const { POST } = await import("@/app/api/agents/build-chat/route");
    const req = new Request("http://localhost/api/agents/build-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Build me an agent" }],
      }),
    });

    const res = await POST(req);
    expect(res.body).toBeTruthy();

    await res.body!.cancel();

    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("supports non-CLI providers over the same SSE contract", async () => {
    aiGenerateMock.mockResolvedValueOnce(
      "Assistant response\n\n```agent-config\n{\"name\":\"x\"}\n```",
    );

    const { POST } = await import("@/app/api/agents/build-chat/route");
    const req = new Request("http://localhost/api/agents/build-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "openai",
        messages: [{ role: "user", content: "Build me an agent" }],
      }),
    });

    const res = await POST(req);
    const events = parseSse(await res.text());

    expect(spawnMock).not.toHaveBeenCalled();
    expect(aiGenerateMock).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      {
        type: "text",
        data: "Assistant response\n\n```agent-config\n{\"name\":\"x\"}\n```",
      },
      { type: "done" },
    ]);
  });

  it("rejects unknown providers", async () => {
    const { POST } = await import("@/app/api/agents/build-chat/route");
    const req = new Request("http://localhost/api/agents/build-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "unknown-provider",
        messages: [{ role: "user", content: "Build me an agent" }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid provider" });
    expect(spawnMock).not.toHaveBeenCalled();
    expect(aiGenerateMock).not.toHaveBeenCalled();
  });
});
