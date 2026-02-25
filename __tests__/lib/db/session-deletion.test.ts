import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

let db: Database.Database;

vi.mock("@/lib/db/index", () => ({
  getDb: () => db,
}));

describe("deleteSessionsWithCleanup", () => {
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY
      );

      CREATE TABLE session_instruction_files (
        session_id TEXT NOT NULL,
        instruction_id TEXT NOT NULL,
        detection_method TEXT NOT NULL
      );

      CREATE TABLE analysis_conversations (
        id TEXT PRIMARY KEY,
        session_ids TEXT NOT NULL,
        enabled_session_ids TEXT NOT NULL,
        updated_at TEXT
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  it("deletes session-linked rows and prunes analysis conversations", async () => {
    db.prepare("INSERT INTO sessions (id) VALUES (?)").run("s1");
    db.prepare("INSERT INTO sessions (id) VALUES (?)").run("s2");
    db.prepare("INSERT INTO sessions (id) VALUES (?)").run("s3");

    db.prepare(
      "INSERT INTO session_instruction_files (session_id, instruction_id, detection_method) VALUES (?, ?, ?)",
    ).run("s1", "i1", "auto");
    db.prepare(
      "INSERT INTO session_instruction_files (session_id, instruction_id, detection_method) VALUES (?, ?, ?)",
    ).run("s2", "i2", "auto");

    db.prepare(
      "INSERT INTO analysis_conversations (id, session_ids, enabled_session_ids, updated_at) VALUES (?, ?, ?, ?)",
    ).run("ac_keep", JSON.stringify(["s1", "s3"]), JSON.stringify(["s1"]), "");
    db.prepare(
      "INSERT INTO analysis_conversations (id, session_ids, enabled_session_ids, updated_at) VALUES (?, ?, ?, ?)",
    ).run("ac_delete", JSON.stringify(["s2"]), JSON.stringify(["s2"]), "");
    db.prepare(
      "INSERT INTO analysis_conversations (id, session_ids, enabled_session_ids, updated_at) VALUES (?, ?, ?, ?)",
    ).run("ac_untouched", JSON.stringify(["s3"]), JSON.stringify(["s3"]), "");

    const { deleteSessionsWithCleanup } = await import(
      "@/lib/db/session-deletion"
    );
    const result = deleteSessionsWithCleanup(["s1", "s2", "missing"]);

    expect(result).toEqual({
      deletedSessions: 2,
      detachedInstructionLinks: 2,
      updatedAnalysisConversations: 1,
      deletedAnalysisConversations: 1,
    });

    const sessionsLeft = db
      .prepare("SELECT id FROM sessions ORDER BY id")
      .all() as Array<{ id: string }>;
    expect(sessionsLeft).toEqual([{ id: "s3" }]);

    const linksLeft = db
      .prepare("SELECT session_id FROM session_instruction_files ORDER BY session_id")
      .all() as Array<{ session_id: string }>;
    expect(linksLeft).toEqual([]);

    const kept = db
      .prepare(
        "SELECT session_ids, enabled_session_ids FROM analysis_conversations WHERE id = ?",
      )
      .get("ac_keep") as
      | { session_ids: string; enabled_session_ids: string }
      | undefined;
    expect(kept).toBeDefined();
    expect(JSON.parse(kept!.session_ids)).toEqual(["s3"]);
    expect(JSON.parse(kept!.enabled_session_ids)).toEqual([]);

    const deleted = db
      .prepare("SELECT id FROM analysis_conversations WHERE id = ?")
      .get("ac_delete") as { id: string } | undefined;
    expect(deleted).toBeUndefined();
  });

  it("returns zero stats for empty input", async () => {
    const { deleteSessionsWithCleanup } = await import(
      "@/lib/db/session-deletion"
    );
    expect(deleteSessionsWithCleanup([])).toEqual({
      deletedSessions: 0,
      detachedInstructionLinks: 0,
      updatedAnalysisConversations: 0,
      deletedAnalysisConversations: 0,
    });
  });
});
