import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";
import { initSchema } from "./schema";
import { dbLog, indexerLog } from "../logger";
import { discoverCodexSessions } from "@/lib/codex/session-discovery";
import { discoverGeminiSessions } from "@/lib/gemini/session-discovery";

const DB_DIR = path.join(os.homedir(), ".claude");
const DB_PATH = path.join(DB_DIR, "dashboard.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    // Ensure directory exists
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    initSchema(db);
    dbLog.info("opened database", { path: DB_PATH });
  }
  return db;
}

let indexPromise: Promise<void> | null = null;
let lastIncrementalRun = 0;
const INCREMENTAL_COOLDOWN_MS = 10_000;

function shouldBackfillProviderParity(db: Database.Database): boolean {
  const codexRow = db
    .prepare("SELECT COUNT(*) as count FROM sessions WHERE project_id = ?")
    .get("codex-sessions") as { count: number };
  const geminiRow = db
    .prepare("SELECT COUNT(*) as count FROM sessions WHERE project_id = ?")
    .get("gemini-sessions") as { count: number };

  if (codexRow.count === 0) {
    try {
      if (discoverCodexSessions().length > 0) return true;
    } catch {
      // ignore discovery failures and continue normal incremental indexing
    }
  }

  if (geminiRow.count === 0) {
    try {
      if (discoverGeminiSessions().length > 0) return true;
    } catch {
      // ignore discovery failures and continue normal incremental indexing
    }
  }

  return false;
}

/**
 * Ensures the session index has been built at least once.
 * First call (empty DB): full rebuildIndex().
 * Subsequent calls: incremental index with a 10s cooldown.
 */
export async function ensureIndexed(): Promise<void> {
  if (indexPromise) return indexPromise;

  const db = getDb();
  const { count } = db
    .prepare("SELECT COUNT(*) as count FROM sessions")
    .get() as { count: number };

  if (count === 0) {
    // First time — full rebuild
    indexerLog.info("first boot — running full rebuild");
    const { rebuildIndex } = await import("../parser/indexer");
    indexPromise = rebuildIndex().then(
      () => { indexPromise = null; },
      () => { indexPromise = null; },
    );
    return indexPromise;
  }

  if (shouldBackfillProviderParity(db)) {
    indexerLog.info(
      "provider parity backfill — running full rebuild for codex/gemini discovery",
    );
    const { rebuildIndex } = await import("../parser/indexer");
    indexPromise = rebuildIndex().then(
      () => {
        indexPromise = null;
      },
      () => {
        indexPromise = null;
      },
    );
    return indexPromise;
  }

  // Subsequent calls — incremental with cooldown
  const now = Date.now();
  if (now - lastIncrementalRun < INCREMENTAL_COOLDOWN_MS) return;

  indexerLog.debug("running incremental index");
  const { incrementalIndex } = await import("../parser/indexer");
  lastIncrementalRun = now;
  indexPromise = incrementalIndex().then(
    () => { indexPromise = null; },
    () => { indexPromise = null; },
  );
  return indexPromise;
}
