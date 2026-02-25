import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createTestDb } from "../helpers/factories";
import type { Database } from "bun:sqlite";
import { NextResponse } from "next/server";

let db: Database;
let cleanup: () => void;

// Mock getDb to use our test database
vi.mock("@/lib/db", () => ({
  getDb: () => db,
  ensureIndexed: async () => {},
}));

// Mock cache headers
vi.mock("@/lib/api/cache-headers", () => ({
  jsonWithCache: (data: unknown) => {
    return NextResponse.json(data);
  },
}));

beforeAll(() => {
  const testDb = createTestDb();
  db = testDb.db;
  cleanup = testDb.cleanup;
  // Insert test data
  db.exec(`
    INSERT INTO projects (id, path, name) VALUES ('proj-1', '/test', 'Test Project');
    INSERT INTO sessions (id, project_id, slug, first_prompt, message_count, tool_call_count,
      input_tokens, output_tokens, cache_read_tokens, total_cost, created_at, modified_at, jsonl_path)
    VALUES
      ('s1', 'proj-1', 'session-1', 'Hello', 5, 3, 1000, 500, 200, 0.05, '2025-01-01T10:00:00Z', '2025-01-01T11:00:00Z', '/test/s1.jsonl'),
      ('s2', 'proj-1', 'session-2', 'World', 10, 8, 5000, 2000, 1000, 0.25, '2025-01-02T10:00:00Z', '2025-01-02T12:00:00Z', '/test/s2.jsonl'),
      ('s3', 'proj-1', 'session-3', 'Test', 0, 0, 0, 0, 0, 0, '2025-01-03T10:00:00Z', '2025-01-03T10:00:00Z', '/test/s3.jsonl');

    UPDATE sessions
    SET model_usage = '{"claude-sonnet-4-5":{"inputTokens":100}}'
    WHERE id = 's1';

    UPDATE sessions
    SET model_usage = '{"claude-sonnet-4-5":{"inputTokens":120},"claude-opus-4-1":{"inputTokens":80}}'
    WHERE id = 's2';
  `);
});

afterAll(() => {
  cleanup();
});

describe("Sessions API", () => {
  describe("GET /api/sessions", () => {
    it("returns sessions with pagination", async () => {
      const { GET } = await import("@/app/api/sessions/route");
      const req = new Request("http://localhost/api/sessions?limit=2&page=1");
      const res = await GET(req);
      const data = await res.json();

      expect(data.sessions).toBeDefined();
      expect(data.total).toBeDefined();
    });

    it("filters out zero-message sessions", async () => {
      const { GET } = await import("@/app/api/sessions/route");
      const req = new Request("http://localhost/api/sessions");
      const res = await GET(req);
      const data = await res.json();

      const groupedSessions = Array.isArray(data.groups)
        ? data.groups.flatMap((g: { sessions?: Array<{ id: string }> }) => g.sessions ?? [])
        : [];
      const sessions: Array<{ id: string }> = data.sessions ?? groupedSessions;
      const zeroMsg = sessions.find((s) => s.id === "s3");
      expect(zeroMsg).toBeUndefined();
    });

    it("does not allow SQL injection via sortBy", async () => {
      const { GET } = await import("@/app/api/sessions/route");
      // Attempt SQL injection through sortBy param
      const req = new Request(
        "http://localhost/api/sessions?sortBy=modified_at;DROP%20TABLE%20sessions",
      );
      const res = await GET(req);
      // Should either succeed with default sorting or return an error, but NOT execute the injection
      expect(res.status).toBeLessThanOrEqual(500);

      // Verify table still exists
      const count = db.prepare("SELECT COUNT(*) as c FROM sessions").get() as {
        c: number;
      };
      expect(count.c).toBe(3);
    });

    it("supports comma-separated model filters with OR semantics by default", async () => {
      const { GET } = await import("@/app/api/sessions/route");
      const req = new Request(
        "http://localhost/api/sessions?model=claude-sonnet-4-5,claude-opus-4-1",
      );
      const res = await GET(req);
      const data = await res.json();

      const ids = (data.sessions as { id: string }[]).map((s) => s.id).sort();
      expect(ids).toEqual(["s1", "s2"]);
    });

    it("supports comma-separated model filters with modelOp=and", async () => {
      const { GET } = await import("@/app/api/sessions/route");
      const req = new Request(
        "http://localhost/api/sessions?model=claude-sonnet-4-5,claude-opus-4-1&modelOp=and",
      );
      const res = await GET(req);
      const data = await res.json();

      const ids = (data.sessions as { id: string }[]).map((s) => s.id).sort();
      expect(ids).toEqual(["s2"]);
    });
  });
});
