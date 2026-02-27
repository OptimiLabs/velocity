import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../helpers/factories";
import type { Database } from "bun:sqlite";

let db: Database;
let cleanup: () => void;

vi.mock("@/lib/db", () => ({
  getDb: () => db,
  ensureIndexed: async () => {},
}));

beforeAll(() => {
  const testDb = createTestDb();
  db = testDb.db;
  cleanup = testDb.cleanup;

  db.exec(`
    INSERT INTO projects (id, path, name) VALUES ('p1', '/tmp/p1', 'P1');

    INSERT INTO sessions (
      id, project_id, slug, first_prompt, message_count, tool_call_count,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_cost,
      created_at, modified_at, jsonl_path, session_role, subagent_type
    ) VALUES
      (
        'standalone-1', 'p1', NULL, NULL, 5, 0,
        100, 50, 20, 10, 0.01,
        '2026-02-20T10:00:00Z', '2026-02-20T10:05:00Z', '/tmp/standalone-1.jsonl',
        'standalone', NULL
      ),
      (
        'subagent-1', 'p1', NULL, NULL, 4, 0,
        200, 100, 40, 20, 0.03,
        '2026-02-20T11:00:00Z', '2026-02-20T11:05:00Z', '/tmp/subagent-1.jsonl',
        'subagent', 'planner'
      ),
      (
        'subagent-zero-msg', 'p1', NULL, NULL, 0, 0,
        1000, 500, 100, 50, 0.2,
        '2026-02-20T12:00:00Z', '2026-02-20T12:05:00Z', '/tmp/subagent-zero-msg.jsonl',
        'subagent', 'planner'
      );
  `);
});

afterAll(() => {
  cleanup();
});

describe("GET /api/analytics/roles", () => {
  it("filters out zero-message sessions and includes cache write tokens", async () => {
    const { GET } = await import("@/app/api/analytics/roles/route");
    const req = new Request(
      "http://localhost/api/analytics/roles?from=2026-02-20&to=2026-02-20",
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);

    const standalone = data.byRole.find((row: { role: string }) => row.role === "standalone");
    const subagent = data.byRole.find((row: { role: string }) => row.role === "subagent");

    expect(standalone).toBeDefined();
    expect(subagent).toBeDefined();
    expect(standalone.sessionCount).toBe(1);
    expect(subagent.sessionCount).toBe(1);
    expect(standalone.cacheWriteTokens).toBe(10);
    expect(subagent.cacheWriteTokens).toBe(20);

    const planner = data.byAgentType.find((row: { type: string }) => row.type === "planner");
    expect(planner).toBeDefined();
    expect(planner.sessionCount).toBe(1);
    expect(planner.cacheWriteTokens).toBe(20);
    expect(planner.totalCost).toBeCloseTo(0.03, 8);
  });
});

