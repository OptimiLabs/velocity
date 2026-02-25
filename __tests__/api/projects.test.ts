import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { createTestDb } from "../helpers/factories";
import type { Database } from "bun:sqlite";

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
  db.exec(`
    INSERT INTO projects (id, path, name, session_count, total_tokens, total_cost) VALUES
      ('p1', '/proj1', 'Project Alpha', 10, 50000, 2.50),
      ('p2', '/proj2', 'Project Beta', 5, 20000, 1.00),
      ('p3', '/proj3', 'Empty Project', 0, 0, 0);
  `);
});

afterAll(() => {
  cleanup();
});

describe("Projects API", () => {
  describe("GET /api/projects", () => {
    it("returns paginated projects", async () => {
      const { GET } = await import("@/app/api/projects/route");
      const req = new NextRequest(
        "http://localhost/api/projects?limit=2&offset=0",
      );
      const res = await GET(req);
      const data = await res.json();

      expect(data.projects).toBeDefined();
      expect(data.total).toBeDefined();
      expect(data.projects.length).toBeLessThanOrEqual(2);
    });

    it("returns all projects within default limit", async () => {
      const { GET } = await import("@/app/api/projects/route");
      const req = new NextRequest("http://localhost/api/projects");
      const res = await GET(req);
      const data = await res.json();

      expect(data.projects.length).toBe(3);
      expect(data.total).toBe(3);
    });

    it("respects offset parameter", async () => {
      const { GET } = await import("@/app/api/projects/route");
      const req = new NextRequest(
        "http://localhost/api/projects?limit=1&offset=2",
      );
      const res = await GET(req);
      const data = await res.json();

      expect(data.projects.length).toBe(1);
      expect(data.offset).toBe(2);
    });
  });
});
