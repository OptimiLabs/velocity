import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { initSchema } from "@/lib/db/schema";

describe("initSchema legacy boot safety", () => {
  it("migrates a v32 sessions table that is missing effort/pricing columns", () => {
    const dbPath = path.join(
      os.tmpdir(),
      `schema-init-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    const db = new Database(dbPath);

    try {
      db.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL,
          name TEXT NOT NULL
        );

        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          message_count INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          modified_at TEXT NOT NULL,
          jsonl_path TEXT NOT NULL,
          compressed_at TEXT,
          provider TEXT DEFAULT 'claude',
          FOREIGN KEY (project_id) REFERENCES projects(id)
        );

        CREATE TABLE index_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        INSERT INTO index_metadata (key, value) VALUES ('schema_version', '32');
      `);

      expect(() => initSchema(db)).not.toThrow();

      const columns = db.prepare("PRAGMA table_info(sessions)").all() as Array<{
        name: string;
      }>;
      const names = new Set(columns.map((column) => column.name));

      expect(names.has("effort_mode")).toBe(true);
      expect(names.has("latency_sample_count")).toBe(true);
      expect(names.has("pricing_status")).toBe(true);
      expect(names.has("unpriced_tokens")).toBe(true);
      expect(names.has("unpriced_messages")).toBe(true);

      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'sessions'",
        )
        .all() as Array<{ name: string }>;
      const indexNames = new Set(indexes.map((row) => row.name));
      expect(indexNames.has("idx_sessions_effort_mode")).toBe(true);
      expect(indexNames.has("idx_sessions_pricing_status")).toBe(true);

      const versionRow = db
        .prepare(
          "SELECT value FROM index_metadata WHERE key = 'schema_version'",
        )
        .get() as { value: string } | undefined;
      expect(versionRow?.value).toBe("36");
    } finally {
      db.close();
      for (const suffix of ["", "-wal", "-shm"]) {
        const filePath = `${dbPath}${suffix}`;
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
  });

  it("backfills missing session sort/path indexes on a v34 database", () => {
    const dbPath = path.join(
      os.tmpdir(),
      `schema-init-indexes-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    const db = new Database(dbPath);

    try {
      db.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL,
          name TEXT NOT NULL
        );

        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          message_count INTEGER DEFAULT 0,
          total_cost REAL DEFAULT 0,
          project_path TEXT,
          created_at TEXT NOT NULL,
          modified_at TEXT NOT NULL,
          jsonl_path TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id)
        );

        CREATE TABLE index_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        INSERT INTO index_metadata (key, value) VALUES ('schema_version', '34');
      `);

      expect(() => initSchema(db)).not.toThrow();

      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'sessions'",
        )
        .all() as Array<{ name: string }>;
      const names = new Set(indexes.map((row) => row.name));

      expect(names.has("idx_sessions_cost")).toBe(true);
      expect(names.has("idx_sessions_messages")).toBe(true);
      expect(names.has("idx_sessions_project_path")).toBe(true);
      expect(names.has("idx_sessions_active_modified")).toBe(true);
      expect(names.has("idx_sessions_active_created")).toBe(true);
      expect(names.has("idx_sessions_parent_created")).toBe(true);

      const versionRow = db
        .prepare(
          "SELECT value FROM index_metadata WHERE key = 'schema_version'",
        )
        .get() as { value: string } | undefined;
      expect(versionRow?.value).toBe("36");
    } finally {
      db.close();
      for (const suffix of ["", "-wal", "-shm"]) {
        const filePath = `${dbPath}${suffix}`;
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
  });
});
