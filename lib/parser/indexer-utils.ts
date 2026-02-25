import fs from "fs";
import type Database from "better-sqlite3";
import { indexerLog } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Bump this version whenever the aggregator output shape changes.
 *  Forces all sessions to be re-aggregated on the next rebuild/incremental run. */
export const ENRICHMENT_VERSION = 13;

/** Number of sessions to process concurrently in each aggregation batch */
export const BATCH_SIZE = 8;

/** Number of bytes to read from the head of a JSONL file for slug/prompt extraction */
const JSONL_HEAD_BYTES = 8192;
/** Max characters to keep from the first human prompt */
const FIRST_PROMPT_MAX_CHARS = 500;
/** Max JSONL lines to scan for slug/prompt */
const MAX_JSONL_HEAD_LINES = 20;

// ---------------------------------------------------------------------------
// readJsonlHead — extract slug/prompt from file head
// ---------------------------------------------------------------------------

/**
 * Read the first few KB of a JSONL file to extract slug and first human prompt.
 */
export function readJsonlHead(filePath: string): {
  slug: string | null;
  firstPrompt: string | null;
} {
  let slug: string | null = null;
  let firstPrompt: string | null = null;
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(JSONL_HEAD_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, JSONL_HEAD_BYTES, 0);
    fs.closeSync(fd);
    const head = buf.toString("utf-8", 0, bytesRead);
    const lines = head.split("\n").filter((l) => l.trim());
    for (const line of lines.slice(0, MAX_JSONL_HEAD_LINES)) {
      try {
        const msg = JSON.parse(line);
        if (msg.slug && !slug) slug = msg.slug;
        if (msg.type === "human" && msg.message?.content && !firstPrompt) {
          const c = msg.message.content;
          firstPrompt =
            typeof c === "string"
              ? c.slice(0, FIRST_PROMPT_MAX_CHARS)
              : JSON.stringify(c).slice(0, FIRST_PROMPT_MAX_CHARS);
        }
        if (slug && firstPrompt) break;
      } catch {
        // skip incomplete JSON at end of buffer
      }
    }
  } catch {
    // Can't read file
  }
  return { slug, firstPrompt };
}

// ---------------------------------------------------------------------------
// Prepared statements for index operations
// ---------------------------------------------------------------------------

/** Prepared statements shared by rebuildIndex and incrementalIndex for atomic session/project upserts. */
export interface IndexStatements {
  insertProject: Database.Statement;
  insertSession: Database.Statement;
  updateSession: Database.Statement;
  updateProject: Database.Statement;
  insertSif: Database.Statement;
  lookupInstruction: Database.Statement;
  hasInstructionLinks: Database.Statement;
}

/**
 * Create all prepared statements needed for index operations in a single place.
 * Centralizes SQL to avoid duplication between rebuildIndex and incrementalIndex.
 */
export function prepareIndexStatements(db: Database.Database): IndexStatements {
  const insertProject = db.prepare(`
    INSERT OR REPLACE INTO projects (id, path, name, session_count, last_activity_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertSession = db.prepare(`
    INSERT OR REPLACE INTO sessions
    (id, project_id, slug, first_prompt, message_count, git_branch, project_path, created_at, modified_at, jsonl_path, session_role, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'standalone', '[]')
  `);

  const updateSession = db.prepare(`
    UPDATE sessions SET
      message_count = ?,
      tool_call_count = ?,
      input_tokens = ?,
      output_tokens = ?,
      cache_read_tokens = ?,
      cache_write_tokens = ?,
      thinking_blocks = ?,
      total_cost = ?,
      tool_usage = ?,
      model_usage = ?,
      enriched_tools = ?,
      summary = ?,
      session_role = ?,
      tags = ?,
      avg_latency_ms = ?,
      p50_latency_ms = ?,
      p95_latency_ms = ?,
      max_latency_ms = ?,
      latency_sample_count = ?,
      session_duration_ms = ?,
      pricing_status = ?,
      unpriced_tokens = ?,
      unpriced_messages = ?,
      provider = ?,
      effort_mode = ?,
      billing_plan = COALESCE(billing_plan, ?)
    WHERE id = ?
  `);

  const updateProject = db.prepare(`
    UPDATE projects SET
      total_tokens = (SELECT COALESCE(SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens), 0) FROM sessions WHERE project_id = ?),
      total_cost = (SELECT COALESCE(SUM(total_cost), 0) FROM sessions WHERE project_id = ?)
    WHERE id = ?
  `);

  const insertSif = db.prepare(
    "INSERT OR IGNORE INTO session_instruction_files (session_id, instruction_id, detection_method) VALUES (?, ?, ?)",
  );
  const lookupInstruction = db.prepare(
    "SELECT id FROM instruction_files WHERE file_path = ?",
  );
  const hasInstructionLinks = db.prepare(
    "SELECT 1 FROM session_instruction_files WHERE session_id = ? LIMIT 1",
  );

  return {
    insertProject,
    insertSession,
    updateSession,
    updateProject,
    insertSif,
    lookupInstruction,
    hasInstructionLinks,
  };
}

// ---------------------------------------------------------------------------
// Batch processing
// ---------------------------------------------------------------------------

/** Process items in batches of `size` concurrently */
export async function processBatched<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>,
  onProgress?: (processed: number, total: number) => void,
  delayMs = 0,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    await Promise.allSettled(batch.map(fn));
    const processed = Math.min(i + size, items.length);
    if (onProgress) onProgress(processed, items.length);
    else if (items.length > 20 && i % (size * 10) === 0) {
      indexerLog.info("indexer progress", {
        processed: i,
        total: items.length,
      });
    }
    if (delayMs > 0 && processed < items.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

/** Type for sessions being aggregated */
export interface AggregationSession {
  id: string;
  jsonl_path: string;
  input_tokens: number;
  modified_at: string;
  project_id: string;
  project_path: string | null;
}

/** Check if the stored enrichment version requires re-aggregation */
export function shouldForceReaggregate(db: Database.Database): boolean {
  try {
    const row = db
      .prepare(
        "SELECT value FROM index_metadata WHERE key = 'enrichment_version'",
      )
      .get() as { value: string } | undefined;
    return (row ? parseInt(row.value, 10) : 0) < ENRICHMENT_VERSION;
  } catch {
    return true;
  }
}
