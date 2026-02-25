import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Database } from "bun:sqlite";
import path from "path";
import os from "os";
import fs from "fs";

describe("prompt_snippets database operations", () => {
  const testDbPath = path.join(os.tmpdir(), `test-dashboard-${Date.now()}.db`);
  let db: Database;

  beforeAll(() => {
    db = new Database(testDbPath);
    db.exec("PRAGMA journal_mode = WAL");

    // Create the schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS prompt_snippets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'general',
        tags TEXT DEFAULT '[]',
        usage_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

    `);
  });

  afterAll(() => {
    db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  it("should create and retrieve a prompt snippet", () => {
    const id = `test_${Date.now()}`;
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO prompt_snippets (id, name, content, category, tags, usage_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `,
    ).run(id, "Test Prompt", "Hello world", "general", '["tag1"]', now, now);

    const row = db
      .prepare("SELECT * FROM prompt_snippets WHERE id = ?")
      .get(id) as Record<string, unknown>;
    expect(row).not.toBeNull();
    expect(row.name).toBe("Test Prompt");
    expect(row.content).toBe("Hello world");
    expect(row.category).toBe("general");
    expect(JSON.parse(row.tags as string)).toEqual(["tag1"]);
  });

  it("should update a prompt snippet", () => {
    const id = `test_update_${Date.now()}`;
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO prompt_snippets (id, name, content, category, tags, usage_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `,
    ).run(id, "Original", "Original content", "general", "[]", now, now);

    db.prepare(
      `
      UPDATE prompt_snippets SET name = ?, content = ?, updated_at = ? WHERE id = ?
    `,
    ).run("Updated", "Updated content", now, id);

    const row = db
      .prepare("SELECT * FROM prompt_snippets WHERE id = ?")
      .get(id) as Record<string, unknown>;
    expect(row.name).toBe("Updated");
    expect(row.content).toBe("Updated content");
  });

  it("should delete a prompt snippet", () => {
    const id = `test_delete_${Date.now()}`;
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO prompt_snippets (id, name, content, category, tags, usage_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `,
    ).run(id, "ToDelete", "", "general", "[]", now, now);

    db.prepare("DELETE FROM prompt_snippets WHERE id = ?").run(id);

    const row = db
      .prepare("SELECT * FROM prompt_snippets WHERE id = ?")
      .get(id);
    expect(row).toBeNull();
  });

  it("should list snippets by category", () => {
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO prompt_snippets (id, name, content, category, tags, usage_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `,
    ).run(
      `cat_test_1_${Date.now()}`,
      "Pre A",
      "",
      "pre-prompt",
      "[]",
      now,
      now,
    );

    db.prepare(
      `
      INSERT INTO prompt_snippets (id, name, content, category, tags, usage_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `,
    ).run(
      `cat_test_2_${Date.now()}`,
      "Post A",
      "",
      "post-prompt",
      "[]",
      now,
      now,
    );

    const prePrompts = db
      .prepare("SELECT * FROM prompt_snippets WHERE category = ?")
      .all("pre-prompt") as Record<string, unknown>[];

    expect(prePrompts.length).toBeGreaterThanOrEqual(1);
    expect(prePrompts.every((r) => r.category === "pre-prompt")).toBe(true);
  });
});
