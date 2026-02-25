import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../helpers/factories";
import type { Database } from "bun:sqlite";
import { NextResponse } from "next/server";

let db: Database;
let cleanup: () => void;

vi.mock("@/lib/db", () => ({
  getDb: () => db,
  ensureIndexed: async () => {},
}));

vi.mock("@/lib/api/cache-headers", () => ({
  jsonWithCache: (data: unknown) => NextResponse.json(data),
}));

beforeAll(() => {
  const testDb = createTestDb();
  db = testDb.db;
  cleanup = testDb.cleanup;

  db.exec(`
    INSERT INTO projects (id, path, name) VALUES ('p1', '/test', 'Test');

    INSERT INTO sessions (
      id, project_id, slug, first_prompt, message_count, tool_call_count,
      input_tokens, output_tokens, cache_read_tokens, total_cost,
      created_at, modified_at, jsonl_path, provider, model_usage
    ) VALUES
      (
        'claude-1', 'p1', NULL, NULL, 10, 0,
        1000, 500, 100, 0.02,
        '2026-02-20T10:00:00Z', '2026-02-20T10:05:00Z', '/tmp/claude.jsonl',
        'claude',
        '{"claude-sonnet-4-5-20250929":{"inputTokens":1000,"outputTokens":500,"cacheReadTokens":100,"cost":0.02,"messageCount":10}}'
      ),
      (
        'codex-1', 'p1', NULL, NULL, 20, 0,
        2000, 1000, 0, 0.04,
        '2026-02-20T11:00:00Z', '2026-02-20T11:10:00Z', '/tmp/codex.jsonl',
        'codex',
        '{"gpt-5.2":{"inputTokens":2000,"outputTokens":1000,"reasoningTokens":120,"cacheReadTokens":0,"cost":0.04,"messageCount":3}}'
      ),
      (
        'gemini-1', 'p1', NULL, NULL, 30, 0,
        3000, 1500, 250, 0.06,
        '2026-02-20T12:00:00Z', '2026-02-20T12:20:00Z', '/tmp/gemini.json',
        'gemini',
        '{"gemini-3-pro-preview":{"inputTokens":3000,"outputTokens":1500,"cacheReadTokens":250,"cost":0.06,"messageCount":2}}'
      ),
      (
        'broken-model-usage', 'p1', NULL, NULL, 1, 0,
        50, 25, 0, 0.001,
        '2026-02-20T12:40:00Z', '2026-02-20T12:45:00Z', '/tmp/broken.jsonl',
        'codex',
        '{not-valid-json'
      );
  `);
});

afterAll(() => {
  cleanup();
});

describe("analytics model/provider parity routes", () => {
  it("returns Codex and Gemini models in filter options", async () => {
    const { GET } = await import("@/app/api/analytics/filter-options/route");
    const req = new Request(
      "http://localhost/api/analytics/filter-options?from=2026-02-20&to=2026-02-20",
    );
    const res = await GET(req);
    const data = await res.json();

    expect(data.providers).toEqual(["claude", "codex", "gemini"]);
    expect(data.models).toContain("gpt-5.2");
    expect(data.models).toContain("gemini-3-pro-preview");
    expect(data.models).toContain("claude-sonnet-4-5-20250929");
  });

  it("scopes model options by provider when provider filter is present", async () => {
    const { GET } = await import("@/app/api/analytics/filter-options/route");
    const req = new Request(
      "http://localhost/api/analytics/filter-options?from=2026-02-20&to=2026-02-20&provider=codex",
    );
    const res = await GET(req);
    const data = await res.json();

    expect(data.models).toEqual(["gpt-5.2"]);
    // provider list remains global so users can switch providers
    expect(data.providers).toEqual(["claude", "codex", "gemini"]);
  });

  it("ignores malformed model_usage rows when building model filter options", async () => {
    const { GET } = await import("@/app/api/analytics/filter-options/route");
    const req = new Request(
      "http://localhost/api/analytics/filter-options?from=2026-02-20&to=2026-02-20",
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.models).toContain("claude-sonnet-4-5-20250929");
    expect(data.models).toContain("gpt-5.2");
    expect(data.models).toContain("gemini-3-pro-preview");
  });

  it("uses per-model messageCount instead of evenly splitting session message_count", async () => {
    const { GET } = await import("@/app/api/analytics/models/route");
    const req = new Request(
      "http://localhost/api/analytics/models?from=2026-02-20&to=2026-02-20",
    );
    const res = await GET(req);
    const data = await res.json();

    const codexRow = data.models.find((m: { model: string }) => m.model === "gpt-5.2");
    const geminiRow = data.models.find(
      (m: { model: string }) => m.model === "gemini-3-pro-preview",
    );

    expect(codexRow).toBeDefined();
    expect(codexRow.messageCount).toBe(3);
    expect(codexRow.reasoningTokens).toBe(120);
    expect(geminiRow).toBeDefined();
    expect(geminiRow.messageCount).toBe(2);
  });

  it("filters model breakdown by provider", async () => {
    const { GET } = await import("@/app/api/analytics/models/route");
    const req = new Request(
      "http://localhost/api/analytics/models?from=2026-02-20&to=2026-02-20&provider=gemini",
    );
    const res = await GET(req);
    const data = await res.json();

    expect(data.models.map((m: { model: string }) => m.model)).toEqual([
      "gemini-3-pro-preview",
    ]);
  });
});
