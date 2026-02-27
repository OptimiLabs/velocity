import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
  jsonWithCache: (data: unknown) => {
    return NextResponse.json(data);
  },
}));

beforeAll(() => {
  const testDb = createTestDb();
  db = testDb.db;
  cleanup = testDb.cleanup;
  // Insert test data with dates for date range filtering
  db.exec(`
    INSERT INTO projects (id, path, name) VALUES ('p1', '/test', 'Test');

    INSERT INTO sessions (id, project_id, slug, first_prompt, message_count, tool_call_count,
      input_tokens, output_tokens, cache_read_tokens, total_cost, created_at, modified_at, jsonl_path)
    VALUES
      ('s1', 'p1', 'test', 'Hello', 10, 5, 5000, 2000, 1000, 0.15, '2025-01-01T10:00:00Z', '2025-01-01T11:00:00Z', '/test/s1.jsonl'),
      ('s2', 'p1', 'test2', 'World', 20, 10, 10000, 4000, 2000, 0.30, '2025-01-02T10:00:00Z', '2025-01-02T12:00:00Z', '/test/s2.jsonl'),
      ('s0', 'p1', 'zero', 'No messages', 0, 0, 9999, 9999, 9999, 9.99, '2025-01-02T13:00:00Z', '2025-01-02T13:01:00Z', '/test/s0.jsonl');
  `);
});

afterAll(() => {
  cleanup();
});

describe("Analytics API", () => {
  describe("GET /api/analytics", () => {
    it("returns daily stats within date range", async () => {
      const { GET } = await import("@/app/api/analytics/route");
      const req = new Request(
        "http://localhost/api/analytics?from=2025-01-01&to=2025-01-02",
      );
      const res = await GET(req);
      const data = await res.json();

      expect(data.daily).toBeDefined();
      expect(data.daily.length).toBe(2);
    });

    it("aggregates totals correctly", async () => {
      const { GET } = await import("@/app/api/analytics/route");
      const req = new Request(
        "http://localhost/api/analytics?from=2025-01-01&to=2025-01-03",
      );
      const res = await GET(req);
      const data = await res.json();

      expect(data.totals).toBeDefined();
      // totals come from sessions table: we have 2 sessions (s1, s2) in this date range
      expect(data.totals.total_sessions).toBe(2);
      expect(data.totals.total_messages).toBe(30); // 10 + 20 from sessions
    });

    it("uses an inclusive previous-period span for single-day ranges", async () => {
      const { GET } = await import("@/app/api/analytics/route");
      const req = new Request(
        "http://localhost/api/analytics?from=2025-01-02&to=2025-01-02",
      );
      const res = await GET(req);
      const data = await res.json();

      expect(data.totals.total_sessions).toBe(1);
      expect(data.previousTotals.total_sessions).toBe(1);
      expect(data.previousTotals.total_messages).toBe(10);
    });

    it("excludes zero-message sessions from totals and distribution", async () => {
      const { GET } = await import("@/app/api/analytics/route");
      const req = new Request(
        "http://localhost/api/analytics?from=2025-01-01&to=2025-01-03",
      );
      const res = await GET(req);
      const data = await res.json();

      expect(data.totals.total_sessions).toBe(2);
      expect(data.totals.total_cost).toBeCloseTo(0.45, 8);
    });
  });

  describe("GET /api/analytics/projects", () => {
    it("returns project cost breakdown", async () => {
      const { GET } = await import("@/app/api/analytics/projects/route");
      const req = new Request(
        "http://localhost/api/analytics/projects?from=2025-01-01&to=2025-01-03",
      );
      const res = await GET(req);
      const data = await res.json();

      expect(data.projects).toBeDefined();
      expect(data.projects.length).toBeGreaterThan(0);
      expect(data.projects[0].total_cost).toBeGreaterThan(0);
    });
  });
});
