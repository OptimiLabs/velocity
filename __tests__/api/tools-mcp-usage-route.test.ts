import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../helpers/factories";
import type { Database } from "bun:sqlite";

let db: Database;
let cleanup: () => void;

vi.mock("@/lib/db", () => ({
  getDb: () => db,
}));

beforeAll(() => {
  const testDb = createTestDb();
  db = testDb.db;
  cleanup = testDb.cleanup;

  db.exec(`
    INSERT INTO projects (id, path, name) VALUES ('p1', '/test', 'Test');
  `);

  const insertSession = db.prepare(`
    INSERT INTO sessions (
      id,
      project_id,
      created_at,
      modified_at,
      jsonl_path,
      tool_usage,
      provider
    )
    VALUES (?, 'p1', ?, ?, ?, ?, ?)
  `);

  insertSession.run(
    "s1",
    "2025-01-01T10:00:00Z",
    "2025-01-02T10:00:00Z",
    "/test/s1.jsonl",
    JSON.stringify({
      mcp__fs__read: {
        count: 2,
        inputTokens: 300,
        outputTokens: 100,
        cacheReadTokens: 50,
        cacheWriteTokens: 25,
        estimatedCost: 0.002,
      },
      Read: {
        count: 9,
      },
    }),
    null,
  );

  insertSession.run(
    "s2",
    "2025-01-02T10:00:00Z",
    "2025-01-03T10:00:00Z",
    "/test/s2.jsonl",
    JSON.stringify({
      mcp__fs__read: {
        count: 1,
        totalTokens: 900,
        estimatedCost: 0.001,
      },
      mcp__git__status: {
        count: 3,
      },
    }),
    null,
  );

  insertSession.run(
    "s3",
    "2025-01-03T10:00:00Z",
    "2025-01-04T10:00:00Z",
    "/test/s3.jsonl",
    JSON.stringify({
      mcp__fs__read: {
        count: 4,
        totalTokens: 400,
        estimatedCost: 0.004,
      },
    }),
    "codex",
  );
});

afterAll(() => {
  cleanup();
});

describe("GET /api/tools/mcp/usage", () => {
  it("returns aggregated MCP usage with token and cost averages", async () => {
    const { GET } = await import("@/app/api/tools/mcp/usage/route");
    const req = new Request("http://localhost/api/tools/mcp/usage?provider=claude");
    const res = await GET(req);
    const data = (await res.json()) as Record<
      string,
      {
        totalCalls: number;
        lastUsed: string | null;
        totalTokens: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
        estimatedCost: number;
        avgTokensPerCall: number;
        avgCostPerCall: number;
      }
    >;

    expect(res.status).toBe(200);
    expect(data.Read).toBeUndefined();

    const fsRead = data["mcp__fs__read"];
    expect(fsRead.totalCalls).toBe(3);
    expect(fsRead.totalTokens).toBe(1375);
    expect(fsRead.inputTokens).toBe(300);
    expect(fsRead.outputTokens).toBe(100);
    expect(fsRead.cacheReadTokens).toBe(50);
    expect(fsRead.cacheWriteTokens).toBe(25);
    expect(fsRead.estimatedCost).toBeCloseTo(0.003, 10);
    expect(fsRead.avgTokensPerCall).toBeCloseTo(1375 / 3, 10);
    expect(fsRead.avgCostPerCall).toBeCloseTo(0.001, 10);
    expect(fsRead.lastUsed).toBe("2025-01-03T10:00:00Z");

    const gitStatus = data["mcp__git__status"];
    expect(gitStatus.totalCalls).toBe(3);
    expect(gitStatus.totalTokens).toBe(0);
    expect(gitStatus.avgTokensPerCall).toBe(0);
    expect(gitStatus.estimatedCost).toBe(0);
    expect(gitStatus.avgCostPerCall).toBe(0);
  });

  it("applies provider filter to MCP usage aggregation", async () => {
    const { GET } = await import("@/app/api/tools/mcp/usage/route");
    const req = new Request("http://localhost/api/tools/mcp/usage?provider=codex");
    const res = await GET(req);
    const data = (await res.json()) as Record<
      string,
      { totalCalls: number; totalTokens: number; avgTokensPerCall: number }
    >;

    expect(res.status).toBe(200);
    expect(Object.keys(data)).toEqual(["mcp__fs__read"]);
    expect(data["mcp__fs__read"].totalCalls).toBe(4);
    expect(data["mcp__fs__read"].totalTokens).toBe(400);
    expect(data["mcp__fs__read"].avgTokensPerCall).toBe(100);
  });
});
