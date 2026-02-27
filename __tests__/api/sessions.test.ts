import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createTestDb } from "../helpers/factories";
import type { Database } from "bun:sqlite";
import { NextResponse } from "next/server";

let db: Database;
let cleanup: () => void;
const ensureIndexedMock = vi.fn(async () => {});

// Mock getDb to use our test database
vi.mock("@/lib/db", () => ({
  getDb: () => db,
  ensureIndexed: ensureIndexedMock,
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

    UPDATE sessions SET cache_write_tokens = 300 WHERE id = 's2';

    UPDATE sessions SET effort_mode = 'xhigh' WHERE id = 's1';
    UPDATE sessions SET effort_mode = 'medium' WHERE id = 's2';
  `);
});

beforeEach(() => {
  ensureIndexedMock.mockReset();
  ensureIndexedMock.mockResolvedValue(undefined);
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

    it("still serves sessions when ensureIndexed fails", async () => {
      ensureIndexedMock.mockRejectedValueOnce(new Error("index failed"));
      const { GET } = await import("@/app/api/sessions/route");
      const req = new Request("http://localhost/api/sessions?limit=5");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(data.sessions)).toBe(true);
      expect(data.sessions.length).toBeGreaterThan(0);
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

    it("filters sessions by effort mode", async () => {
      const { GET } = await import("@/app/api/sessions/route");
      const req = new Request("http://localhost/api/sessions?effortMode=xhigh");
      const res = await GET(req);
      const data = await res.json();

      const ids = (data.sessions as { id: string }[]).map((s) => s.id);
      expect(ids).toEqual(["s1"]);
    });

    it("includes cache read/write tokens in group-by-project totals", async () => {
      const { GET } = await import("@/app/api/sessions/route");
      const req = new Request(
        "http://localhost/api/sessions?groupByProject=true",
      );
      const res = await GET(req);
      const data = await res.json();

      expect(Array.isArray(data.grouped)).toBe(true);
      expect(data.grouped.length).toBe(1);
      expect(Number(data.grouped[0].total_tokens)).toBe(10_000);
    });

    it("excludes compressed sessions by default and supports compressionState filters", async () => {
      db.prepare("UPDATE sessions SET compressed_at = ? WHERE id = ?").run(
        "2026-02-25T00:00:00.000Z",
        "s2",
      );

      const { GET } = await import("@/app/api/sessions/route");
      const defaultRes = await GET(new Request("http://localhost/api/sessions"));
      const defaultData = await defaultRes.json();
      const defaultIds = (defaultData.sessions as { id: string }[]).map(
        (s) => s.id,
      );
      expect(defaultIds).toEqual(["s1"]);

      const compressedRes = await GET(
        new Request("http://localhost/api/sessions?compressionState=compressed"),
      );
      const compressedData = await compressedRes.json();
      const compressedIds = (compressedData.sessions as { id: string }[]).map(
        (s) => s.id,
      );
      expect(compressedIds).toEqual(["s2"]);

      const allRes = await GET(
        new Request("http://localhost/api/sessions?compressionState=all"),
      );
      const allData = await allRes.json();
      const allIds = (allData.sessions as { id: string }[]).map((s) => s.id).sort();
      expect(allIds).toEqual(["s1", "s2"]);

      db.prepare("UPDATE sessions SET compressed_at = NULL WHERE id = ?").run("s2");
    });
  });

  describe("PATCH /api/sessions", () => {
    it("compresses and restores sessions in bulk", async () => {
      const { PATCH } = await import("@/app/api/sessions/route");

      const compressReq = new Request("http://localhost/api/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ["s1", "s2"], action: "compress" }),
      });
      const compressRes = await PATCH(compressReq);
      const compressData = await compressRes.json();
      expect(compressRes.status).toBe(200);
      expect(compressData.updated).toBe(2);
      expect(compressData.projectAggregates?.activeOnly).toBe(true);

      const compressedCount = db
        .prepare(
          "SELECT COUNT(*) as c FROM sessions WHERE id IN ('s1','s2') AND compressed_at IS NOT NULL",
        )
        .get() as { c: number };
      expect(compressedCount.c).toBe(2);

      const projectAfterCompress = db
        .prepare(
          "SELECT session_count, total_tokens, total_cost, last_activity_at FROM projects WHERE id = 'proj-1'",
        )
        .get() as {
        session_count: number;
        total_tokens: number;
        total_cost: number;
        last_activity_at: string | null;
      };
      expect(projectAfterCompress.session_count).toBe(0);
      expect(projectAfterCompress.total_tokens).toBe(0);
      expect(projectAfterCompress.total_cost).toBe(0);
      expect(projectAfterCompress.last_activity_at).toBeNull();

      const restoreReq = new Request("http://localhost/api/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ["s1", "s2"], action: "restore" }),
      });
      const restoreRes = await PATCH(restoreReq);
      const restoreData = await restoreRes.json();
      expect(restoreRes.status).toBe(200);
      expect(restoreData.updated).toBe(2);

      const restoredCount = db
        .prepare(
          "SELECT COUNT(*) as c FROM sessions WHERE id IN ('s1','s2') AND compressed_at IS NULL",
        )
        .get() as { c: number };
      expect(restoredCount.c).toBe(2);

      const projectAfterRestore = db
        .prepare(
          "SELECT session_count, total_tokens, total_cost, last_activity_at FROM projects WHERE id = 'proj-1'",
        )
        .get() as {
        session_count: number;
        total_tokens: number;
        total_cost: number;
        last_activity_at: string | null;
      };
      expect(projectAfterRestore.session_count).toBe(2);
      expect(projectAfterRestore.total_tokens).toBe(10_000);
      expect(projectAfterRestore.total_cost).toBeCloseTo(0.3, 6);
      expect(projectAfterRestore.last_activity_at).toBe("2025-01-02T12:00:00Z");
    });

    it("compresses sessions from a given date onward", async () => {
      const { PATCH } = await import("@/app/api/sessions/route");
      db.prepare("UPDATE sessions SET compressed_at = NULL WHERE id IN ('s1','s2')").run();

      const compressReq = new Request("http://localhost/api/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "compress", fromDate: "2025-01-02" }),
      });
      const compressRes = await PATCH(compressReq);
      const compressData = await compressRes.json();
      expect(compressRes.status).toBe(200);
      expect(compressData.mode).toBe("fromDate");
      expect(compressData.updated).toBe(1);

      const s1 = db
        .prepare("SELECT compressed_at FROM sessions WHERE id = 's1'")
        .get() as { compressed_at: string | null };
      const s2 = db
        .prepare("SELECT compressed_at FROM sessions WHERE id = 's2'")
        .get() as { compressed_at: string | null };
      expect(s1.compressed_at).toBeNull();
      expect(s2.compressed_at).toBeTruthy();

      const restoreReq = new Request("http://localhost/api/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", fromDate: "2025-01-02" }),
      });
      const restoreRes = await PATCH(restoreReq);
      const restoreData = await restoreRes.json();
      expect(restoreRes.status).toBe(200);
      expect(restoreData.updated).toBe(1);
    });
  });

  describe("PATCH /api/sessions/[id]", () => {
    it("compresses and restores a single session", async () => {
      const { PATCH } = await import("@/app/api/sessions/[id]/route");

      const compressReq = new Request("http://localhost/api/sessions/s1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "compress" }),
      });
      const compressRes = await PATCH(compressReq, {
        params: Promise.resolve({ id: "s1" }),
      });
      expect(compressRes.status).toBe(200);
      const compressData = await compressRes.json();
      expect(compressData.projectAggregates?.activeOnly).toBe(true);

      const compressed = db
        .prepare("SELECT compressed_at FROM sessions WHERE id = 's1'")
        .get() as { compressed_at: string | null };
      expect(compressed.compressed_at).toBeTruthy();

      const projectAfterCompress = db
        .prepare(
          "SELECT session_count, total_tokens, total_cost, last_activity_at FROM projects WHERE id = 'proj-1'",
        )
        .get() as {
        session_count: number;
        total_tokens: number;
        total_cost: number;
        last_activity_at: string | null;
      };
      expect(projectAfterCompress.session_count).toBe(1);
      expect(projectAfterCompress.total_tokens).toBe(8_300);
      expect(projectAfterCompress.total_cost).toBeCloseTo(0.25, 6);
      expect(projectAfterCompress.last_activity_at).toBe("2025-01-02T12:00:00Z");

      const restoreReq = new Request("http://localhost/api/sessions/s1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const restoreRes = await PATCH(restoreReq, {
        params: Promise.resolve({ id: "s1" }),
      });
      expect(restoreRes.status).toBe(200);

      const restored = db
        .prepare("SELECT compressed_at FROM sessions WHERE id = 's1'")
        .get() as { compressed_at: string | null };
      expect(restored.compressed_at).toBeNull();

      const projectAfterRestore = db
        .prepare(
          "SELECT session_count, total_tokens, total_cost, last_activity_at FROM projects WHERE id = 'proj-1'",
        )
        .get() as {
        session_count: number;
        total_tokens: number;
        total_cost: number;
        last_activity_at: string | null;
      };
      expect(projectAfterRestore.session_count).toBe(2);
      expect(projectAfterRestore.total_tokens).toBe(10_000);
      expect(projectAfterRestore.total_cost).toBeCloseTo(0.3, 6);
      expect(projectAfterRestore.last_activity_at).toBe("2025-01-02T12:00:00Z");
    });
  });
});
