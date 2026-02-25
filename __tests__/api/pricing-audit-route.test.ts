import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
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
    INSERT INTO projects (id, path, name) VALUES ('p1', '/tmp/project', 'Project');
    INSERT INTO sessions (
      id, project_id, message_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
      total_cost, created_at, modified_at, jsonl_path, provider, model_usage, effort_mode
    ) VALUES (
      's-1', 'p1', 2, 1000, 500, 0, 0,
      0.42, '2026-02-20T10:00:00.000Z', '2026-02-20T10:01:00.000Z', '/tmp/none.jsonl', 'codex',
      '{\"gpt-5.9-codex\":{\"inputTokens\":1000,\"outputTokens\":500,\"cacheReadTokens\":0,\"cacheWriteTokens\":0}}',
      'xhigh'
    );
  `);
});

afterAll(() => {
  cleanup();
});

describe("GET /api/sessions/pricing-audit", () => {
  it("returns unknown/unpriced model summaries", async () => {
    const { GET } = await import("@/app/api/sessions/pricing-audit/route");
    const req = new Request(
      "http://localhost/api/sessions/pricing-audit?from=2026-02-20&to=2026-02-20",
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.unpricedSessions).toBe(1);
    expect(data.unknownModels.length).toBe(1);
    expect(data.unknownModels[0].model).toBe("gpt-5.9-codex");
    expect(data.unknownModels[0].provider).toBe("codex");
    expect(data.snapshotVersion).toBeDefined();
  });
});
