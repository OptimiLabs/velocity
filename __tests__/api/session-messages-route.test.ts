import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../helpers/factories";
import type { Database } from "bun:sqlite";
import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";

let db: Database;
let cleanup: () => void;
let codexFile = "";
let geminiFile = "";

vi.mock("@/lib/db", () => ({
  getDb: () => db,
}));

vi.mock("@/lib/api/cache-headers", () => ({
  jsonWithCache: (data: unknown) => NextResponse.json(data),
}));

beforeAll(() => {
  const testDb = createTestDb();
  db = testDb.db;
  cleanup = testDb.cleanup;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-messages-"));
  codexFile = path.join(tmpDir, "codex.jsonl");
  geminiFile = path.join(tmpDir, "gemini.json");

  fs.writeFileSync(
    codexFile,
    [
      JSON.stringify({
        timestamp: "2026-02-25T19:21:31.000Z",
        type: "turn_context",
        payload: {
          model: "gpt-5.2-codex",
        },
      }),
      JSON.stringify({
        timestamp: "2026-02-25T19:21:32.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "hello from codex",
        },
      }),
      JSON.stringify({
        timestamp: "2026-02-25T19:21:32.774Z",
        type: "event_msg",
        payload: {
          type: "agent_message",
          message: "hello from codex assistant",
        },
      }),
      JSON.stringify({
        timestamp: "2026-02-25T19:21:33.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 120,
              cached_input_tokens: 40,
              output_tokens: 20,
              reasoning_output_tokens: 5,
              total_tokens: 145,
            },
            last_token_usage: {
              input_tokens: 120,
              cached_input_tokens: 40,
              output_tokens: 20,
              reasoning_output_tokens: 5,
              total_tokens: 145,
            },
            model_context_window: 258400,
          },
        },
      }),
    ].join("\n") + "\n",
  );

  fs.writeFileSync(
    geminiFile,
    JSON.stringify(
      {
        sessionId: "gemini-session",
        startTime: "2026-02-24T03:28:14.262Z",
        messages: [
          {
            id: "m1",
            timestamp: "2026-02-24T03:28:14.262Z",
            type: "user",
            parts: [{ text: "hello from gemini user" }],
          },
          {
            id: "m2",
            timestamp: "2026-02-24T03:28:15.262Z",
            type: "model",
            parts: [{ text: "hello from gemini model" }],
            metadata: { model: "gemini-3-pro-preview" },
            tokens: {
              input: 100,
              output: 20,
              cached: 40,
            },
          },
        ],
      },
      null,
      2,
    ),
  );

  db.exec(`
    INSERT INTO projects (id, path, name) VALUES ('p1', '/tmp/project', 'Project');

    INSERT INTO sessions (
      id, project_id, slug, first_prompt, message_count, tool_call_count,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_cost,
      created_at, modified_at, jsonl_path, provider
    ) VALUES
      (
        'codex-test', 'p1', NULL, NULL, 0, 0,
        0, 0, 0, 0, 0,
        '2026-02-25T19:21:32.774Z', '2026-02-25T19:21:32.774Z', '${codexFile.replace(/'/g, "''")}', 'codex'
      ),
      (
        'gemini-test', 'p1', NULL, NULL, 2, 0,
        0, 0, 0, 0, 0,
        '2026-02-24T03:28:14.262Z', '2026-02-24T03:28:15.262Z', '${geminiFile.replace(/'/g, "''")}', 'gemini'
      );
  `);
});

afterAll(() => {
  try {
    if (codexFile && fs.existsSync(codexFile)) fs.unlinkSync(codexFile);
    if (geminiFile && fs.existsSync(geminiFile)) fs.unlinkSync(geminiFile);
    const dir = path.dirname(codexFile || geminiFile);
    if (dir && fs.existsSync(dir)) fs.rmdirSync(dir);
  } catch {
    // ignore test cleanup failures
  }
  cleanup();
});

describe("Session messages route", () => {
  it("normalizes codex response_item messages to renderable transcript messages", async () => {
    const { GET } = await import("@/app/api/sessions/[id]/messages/route");
    const req = new Request("http://localhost/api/sessions/codex-test/messages");
    const res = await GET(req, {
      params: Promise.resolve({ id: "codex-test" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(data.messages)).toBe(true);
    expect(data.messages.length).toBeGreaterThan(0);
    expect(data.messages[0].message.role).toBe("user");
    const assistant = data.messages.find(
      (msg: { message?: { role?: string } }) => msg.message?.role === "assistant",
    );
    expect(assistant).toBeDefined();
    expect(assistant.cost.pricingStatus).toBe("priced");
    expect(assistant.cost.totalTokens).toBe(185);
    expect(assistant.message.usage.cached_input_tokens).toBe(40);
    expect(assistant.message.usage.output_tokens).toBe(25);
    expect(assistant.message.usage.reasoning_output_tokens).toBe(5);
  });

  it("normalizes gemini session json messages array into transcript messages", async () => {
    const { GET } = await import("@/app/api/sessions/[id]/messages/route");
    const req = new Request("http://localhost/api/sessions/gemini-test/messages");
    const res = await GET(req, {
      params: Promise.resolve({ id: "gemini-test" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.total).toBe(2);
    expect(data.messages[0].message.role).toBe("user");
    expect(data.messages[1].message.role).toBe("assistant");
    expect(data.messages[1].cost.pricingStatus).toBe("priced");
    expect(data.messages[1].cost.totalTokens).toBe(160);
    expect(data.messages[1].message.usage.cached).toBe(40);
  });
});
