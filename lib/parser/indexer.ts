import fs from "fs";
import path from "path";
import { PROJECTS_DIR } from "@/lib/claude-paths";
import { getDb } from "@/lib/db";
import { aggregateSession } from "./session-aggregator";
import { readSettings } from "@/lib/claude-settings";
import { indexerLog } from "@/lib/logger";
import { discoverCodexSessions } from "@/lib/codex/session-discovery";
import { CODEX_HOME } from "@/lib/codex/paths";
import { parseCodexSession } from "@/lib/codex/session-parser";
import { discoverGeminiSessions } from "@/lib/gemini/session-discovery";
import { parseGeminiSession } from "@/lib/gemini/session-parser";
import { GEMINI_TMP_DIR } from "@/lib/gemini/paths";

// Extracted modules
import {
  deriveProjectName,
  deriveProjectPath,
  discoverSubagentFiles,
  linkSessionInstructionFiles,
} from "./project-discovery";
import {
  ENRICHMENT_VERSION,
  BATCH_SIZE,
  readJsonlHead,
  prepareIndexStatements,
  processBatched,
  shouldForceReaggregate,
} from "./indexer-utils";
import type { IndexStatements, AggregationSession } from "./indexer-utils";

// Re-export for backward compatibility (used by lib/context/helpers.ts, lib/instructions/indexer.ts)
export { deriveProjectPath } from "./project-discovery";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface SessionsIndex {
  version: number;
  entries: SessionEntry[];
}

interface SessionEntry {
  sessionId: string;
  fullPath: string;
  fileMtime: number;
  firstPrompt: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch?: string;
  projectPath?: string;
  isSidechain?: boolean;
}

// ---------------------------------------------------------------------------
// Shared helper: aggregation pass
// ---------------------------------------------------------------------------

/**
 * Second-pass aggregation: parse JSONL files, compute stats, update sessions,
 * link instruction files, and update project aggregates.
 *
 * @param sessions - candidate sessions to consider for aggregation
 * @param filterFn - optional additional filter applied to non-force-reaggregate sessions
 */
async function runAggregationPass(
  db: import("better-sqlite3").Database,
  sessions: AggregationSession[],
  stmts: IndexStatements,
  options: {
    batchDelay: number;
    forceReaggregate: boolean;
    filterFn?: (sess: AggregationSession, hasLinks: boolean) => boolean;
  },
): Promise<void> {
  const currentBillingPlan = (() => {
    try {
      return readSettings().statuslinePlan ?? null;
    } catch {
      return null;
    }
  })();

  // Filter to sessions that actually need aggregation
  const sessionsToAggregate = options.forceReaggregate
    ? sessions
    : sessions.filter((sess) => {
        const hasLinks = !!stmts.hasInstructionLinks.get(sess.id);
        if (options.filterFn) {
          return options.filterFn(sess, hasLinks);
        }
        // Default filter: skip if already aggregated, linked, and JSONL unchanged
        if (sess.input_tokens > 0 && hasLinks) {
          try {
            const stat = fs.statSync(sess.jsonl_path);
            if (stat.mtime.toISOString() <= sess.modified_at) return false;
          } catch {
            return true;
          }
        }
        return true;
      });

  const projectsToUpdate = new Set<string>();

  await processBatched(
    sessionsToAggregate,
    BATCH_SIZE,
    async (sess) => {
      try {
        // Provider-specific session formats need dedicated parsers.
        const stats =
          sess.project_id === "codex-sessions"
            ? await parseCodexSession(sess.jsonl_path)
            : sess.jsonl_path.endsWith(".json")
              ? parseGeminiSession(sess.jsonl_path)
              : await aggregateSession(sess.jsonl_path);
        stmts.updateSession.run(
          stats.messageCount,
          stats.toolCallCount,
          stats.inputTokens,
          stats.outputTokens,
          stats.cacheReadTokens,
          stats.cacheWriteTokens,
          stats.thinkingBlocks,
          stats.totalCost,
          stats.firstPrompt ?? null,
          JSON.stringify(stats.toolUsage),
          JSON.stringify(stats.modelUsage),
          JSON.stringify(stats.enrichedTools),
          stats.autoSummary,
          stats.sessionRole,
          JSON.stringify(stats.tags),
          stats.avgLatencyMs,
          stats.p50LatencyMs,
          stats.p95LatencyMs,
          stats.maxLatencyMs,
          stats.latencySampleCount,
          stats.sessionDurationMs,
          stats.pricingStatus,
          stats.unpricedTokens,
          stats.unpricedMessages,
          stats.gitBranch ?? null,
          stats.projectPath ?? null,
          stats.detectedProvider ?? "claude",
          stats.effortMode,
          currentBillingPlan,
          sess.id,
        );
        linkSessionInstructionFiles(
          stmts.insertSif,
          stmts.lookupInstruction,
          sess.id,
          stats.projectPath ?? sess.project_path,
          stats.detectedInstructionPaths,
        );
        projectsToUpdate.add(sess.project_id);
      } catch {
        // Skip sessions whose JSONL files can't be read
      }
    },
    undefined,
    options.batchDelay,
  );

  // Only update aggregates for projects with re-aggregated sessions
  for (const projId of projectsToUpdate) {
    stmts.updateProject.run(projId, projId, projId);
  }

  // Link parent-child sessions
  linkParentSessions();

  // Store last_indexed_at and enrichment version
  const metaInsert = db.prepare(
    "INSERT OR REPLACE INTO index_metadata (key, value) VALUES (?, ?)",
  );
  metaInsert.run("last_indexed_at", new Date().toISOString());
  metaInsert.run("enrichment_version", String(ENRICHMENT_VERSION));
}

// ---------------------------------------------------------------------------
// Exported entry points
// ---------------------------------------------------------------------------

export async function rebuildIndex(options?: { batchDelay?: number }): Promise<{
  projectCount: number;
  sessionCount: number;
}> {
  const batchDelay = options?.batchDelay ?? 50;
  const db = getDb();
  const stmts = prepareIndexStatements(db);
  let projectCount = 0;
  let sessionCount = 0;

  // Use a transaction for atomic updates
  const transaction = db.transaction(() => {
    // Scan all project directories
    if (!fs.existsSync(PROJECTS_DIR)) return;

    const projectDirs = fs
      .readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const projectDir of projectDirs) {
      const projectPath = path.join(PROJECTS_DIR, projectDir.name);
      const indexPath = path.join(projectPath, "sessions-index.json");

      const projectName = deriveProjectName(projectDir.name);

      // Check for sessions-index.json
      if (fs.existsSync(indexPath)) {
        try {
          const index: SessionsIndex = JSON.parse(
            fs.readFileSync(indexPath, "utf-8"),
          );
          const entries = index.entries || [];

          let lastActivity: string | null = null;
          for (const entry of entries) {
            if (!lastActivity || entry.modified > lastActivity) {
              lastActivity = entry.modified;
            }
          }

          // Insert project FIRST (foreign key constraint)
          stmts.insertProject.run(
            projectDir.name,
            projectPath,
            projectName,
            entries.length,
            lastActivity,
          );
          projectCount++;

          for (const entry of entries) {
            stmts.insertSession.run(
              entry.sessionId,
              projectDir.name,
              null, // slug - populated from JSONL
              entry.firstPrompt || null,
              entry.messageCount || 0,
              entry.gitBranch || null,
              entry.projectPath || null,
              entry.created,
              entry.modified,
              entry.fullPath,
            );
            sessionCount++;
          }

          // Also scan for subagent files not in the index
          const subagentFiles = discoverSubagentFiles(projectPath);
          for (const sub of subagentFiles) {
            try {
              const stat = fs.statSync(sub.filePath);
              stmts.insertSession.run(
                sub.sessionId,
                projectDir.name,
                null,
                null,
                0,
                null,
                null,
                stat.birthtime.toISOString(),
                stat.mtime.toISOString(),
                sub.filePath,
              );
              sessionCount++;
            } catch {
              /* skip */
            }
          }
        } catch {
          // Skip invalid index files
        }
      } else {
        // No index file - scan for JSONL files directly
        const jsonlFiles = fs
          .readdirSync(projectPath)
          .filter((f) => f.endsWith(".jsonl"));

        if (jsonlFiles.length === 0) continue;

        // Derive filesystem project path from directory name
        const derivedPath = deriveProjectPath(projectDir.name);

        // Insert project FIRST (foreign key constraint)
        stmts.insertProject.run(
          projectDir.name,
          projectPath,
          projectName,
          jsonlFiles.length,
          null, // will update after scanning
        );
        projectCount++;

        let lastActivity: string | null = null;

        for (const file of jsonlFiles) {
          const filePath = path.join(projectPath, file);
          const sessionId = path.basename(file, ".jsonl");
          const stat = fs.statSync(filePath);
          const modified = stat.mtime.toISOString();
          const created = stat.birthtime.toISOString();

          if (!lastActivity || modified > lastActivity) {
            lastActivity = modified;
          }

          const { slug, firstPrompt } = readJsonlHead(filePath);

          stmts.insertSession.run(
            sessionId,
            projectDir.name,
            slug,
            firstPrompt,
            0, // message_count unknown without full parse
            null, // git_branch
            derivedPath, // project_path derived from directory name
            created,
            modified,
            filePath,
          );
          sessionCount++;
        }

        // Scan for subagent JSONL files in <session-id>/subagents/ subdirectories
        const subagentFiles = discoverSubagentFiles(projectPath);
        for (const sub of subagentFiles) {
          try {
            const stat = fs.statSync(sub.filePath);
            const modified = stat.mtime.toISOString();
            const created = stat.birthtime.toISOString();
            if (!lastActivity || modified > lastActivity)
              lastActivity = modified;
            stmts.insertSession.run(
              sub.sessionId,
              projectDir.name,
              null,
              null,
              0,
              null,
              null,
              created,
              modified,
              sub.filePath,
            );
            sessionCount++;
          } catch {
            /* skip unreadable */
          }
        }

        // Update project with last activity
        if (lastActivity) {
          db.prepare(
            "UPDATE projects SET last_activity_at = ? WHERE id = ?",
          ).run(lastActivity, projectDir.name);
        }
      }
    }

    // -----------------------------------------------------------------------
    // Codex session discovery
    // -----------------------------------------------------------------------
    try {
      const codexEntries = discoverCodexSessions();
      if (codexEntries.length > 0) {
        let codexLastActivity: string | null = null;
        for (const e of codexEntries) {
          if (!codexLastActivity || e.modifiedAt > codexLastActivity)
            codexLastActivity = e.modifiedAt;
        }
        stmts.insertProject.run(
          "codex-sessions",
          CODEX_HOME,
          "Codex CLI",
          codexEntries.length,
          codexLastActivity,
        );
        projectCount++;
        for (const entry of codexEntries) {
          stmts.insertSession.run(
            entry.sessionId,
            "codex-sessions",
            null,
            null,
            0,
            null,
            null,
            entry.createdAt,
            entry.modifiedAt,
            entry.filePath,
          );
          sessionCount++;
        }
      }
    } catch {
      // Codex directory may not exist — skip silently
    }

    // -----------------------------------------------------------------------
    // Gemini session discovery
    // -----------------------------------------------------------------------
    try {
      const geminiEntries = discoverGeminiSessions();
      if (geminiEntries.length > 0) {
        let geminiLastActivity: string | null = null;
        for (const e of geminiEntries) {
          if (!geminiLastActivity || e.modifiedAt > geminiLastActivity)
            geminiLastActivity = e.modifiedAt;
        }
        stmts.insertProject.run(
          "gemini-sessions",
          GEMINI_TMP_DIR,
          "Gemini CLI",
          geminiEntries.length,
          geminiLastActivity,
        );
        projectCount++;
        for (const entry of geminiEntries) {
          const sessionId = `gemini-${entry.projectHash}-${entry.sessionName}`;
          stmts.insertSession.run(
            sessionId,
            "gemini-sessions",
            null,
            null,
            0,
            null,
            entry.projectPath ?? null,
            entry.createdAt,
            entry.modifiedAt,
            entry.filePath,
          );
          sessionCount++;
        }
      }
    } catch {
      // Gemini directory may not exist — skip silently
    }

    return { projectCount, sessionCount };
  });

  const result = transaction() as {
    projectCount: number;
    sessionCount: number;
  };

  // Second pass: aggregate JSONL data for sessions (async — runs after sync transaction)
  const allSessions = db
    .prepare(
      "SELECT id, jsonl_path, input_tokens, modified_at, project_id, project_path FROM sessions",
    )
    .all() as AggregationSession[];

  await runAggregationPass(db, allSessions, stmts, {
    batchDelay,
    forceReaggregate: shouldForceReaggregate(db),
  });

  return result;
}

/**
 * Incremental index — only processes new, changed, or deleted sessions since last_indexed_at.
 * Falls back to full rebuildIndex() if no previous index timestamp exists.
 */
export async function incrementalIndex(options?: {
  batchDelay?: number;
}): Promise<{
  projectCount: number;
  sessionCount: number;
  skippedProjects: number;
  deletedSessions: number;
}> {
  const batchDelay = options?.batchDelay ?? 50;
  const db = getDb();

  // Read last_indexed_at
  const row = db
    .prepare("SELECT value FROM index_metadata WHERE key = ?")
    .get("last_indexed_at") as { value: string } | undefined;

  if (!row) {
    // No prior index — do a full rebuild
    const result = await rebuildIndex();
    return { ...result, skippedProjects: 0, deletedSessions: 0 };
  }

  const lastIndexedAt = new Date(row.value);
  const stmts = prepareIndexStatements(db);
  let projectCount = 0;
  let sessionCount = 0;
  let skippedProjects = 0;
  let deletedSessions = 0;

  if (!fs.existsSync(PROJECTS_DIR)) {
    return { projectCount, sessionCount, skippedProjects, deletedSessions };
  }

  const deleteSession = db.prepare("DELETE FROM sessions WHERE id = ?");

  const projectDirs = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  // Track which project dirs exist on disk for orphan project cleanup
  const diskProjectIds = new Set<string>();

  for (const projectDir of projectDirs) {
    diskProjectIds.add(projectDir.name);
    const projectPath = path.join(PROJECTS_DIR, projectDir.name);
    const indexPath = path.join(projectPath, "sessions-index.json");

    // Check if this project has changed since last index
    let dirMtime: Date;
    try {
      dirMtime = fs.statSync(projectPath).mtime;
    } catch {
      continue;
    }

    let indexMtime: Date | null = null;
    if (fs.existsSync(indexPath)) {
      try {
        indexMtime = fs.statSync(indexPath).mtime;
      } catch {
        /* ignore */
      }
    }

    // If both dir and index file are older than last_indexed_at, skip
    const dirChanged = dirMtime > lastIndexedAt;
    const indexChanged = indexMtime ? indexMtime > lastIndexedAt : false;
    if (!dirChanged && !indexChanged) {
      skippedProjects++;
      continue;
    }

    const projectName = deriveProjectName(projectDir.name);
    projectCount++;

    // Get existing session IDs for this project (for deletion detection)
    const existingSessionIds = new Set(
      (
        db
          .prepare("SELECT id FROM sessions WHERE project_id = ?")
          .all(projectDir.name) as { id: string }[]
      ).map((r) => r.id),
    );

    if (fs.existsSync(indexPath) && indexMtime && indexMtime > lastIndexedAt) {
      // Index file changed — re-read it and upsert
      try {
        const index: SessionsIndex = JSON.parse(
          fs.readFileSync(indexPath, "utf-8"),
        );
        const entries = index.entries || [];
        const diskSessionIds = new Set<string>();

        let lastActivity: string | null = null;
        for (const entry of entries) {
          if (!lastActivity || entry.modified > lastActivity) {
            lastActivity = entry.modified;
          }
        }

        stmts.insertProject.run(
          projectDir.name,
          projectPath,
          projectName,
          entries.length,
          lastActivity,
        );

        for (const entry of entries) {
          diskSessionIds.add(entry.sessionId);
          stmts.insertSession.run(
            entry.sessionId,
            projectDir.name,
            null,
            entry.firstPrompt || null,
            entry.messageCount || 0,
            entry.gitBranch || null,
            entry.projectPath || null,
            entry.created,
            entry.modified,
            entry.fullPath,
          );
          sessionCount++;
        }

        // Also discover subagent files
        const subagentFiles = discoverSubagentFiles(projectPath);
        for (const sub of subagentFiles) {
          diskSessionIds.add(sub.sessionId);
          if (existingSessionIds.has(sub.sessionId)) continue;
          try {
            const stat = fs.statSync(sub.filePath);
            stmts.insertSession.run(
              sub.sessionId,
              projectDir.name,
              null,
              null,
              0,
              null,
              null,
              stat.birthtime.toISOString(),
              stat.mtime.toISOString(),
              sub.filePath,
            );
            sessionCount++;
          } catch {
            /* skip */
          }
        }

        // Delete orphaned sessions (in DB but not on disk)
        for (const existingId of existingSessionIds) {
          if (!diskSessionIds.has(existingId)) {
            deleteSession.run(existingId);
            deletedSessions++;
          }
        }
      } catch {
        // Skip invalid index files
      }
    } else {
      // No index file or index unchanged — check individual JSONL files
      let jsonlFiles: string[];
      try {
        jsonlFiles = fs
          .readdirSync(projectPath)
          .filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }

      if (jsonlFiles.length === 0) {
        // All sessions may have been deleted
        for (const existingId of existingSessionIds) {
          deleteSession.run(existingId);
          deletedSessions++;
        }
        continue;
      }

      // Derive filesystem project path from directory name
      const derivedPathInc = deriveProjectPath(projectDir.name);

      // Upsert project first so FK constraint is satisfied when inserting sessions
      stmts.insertProject.run(
        projectDir.name,
        projectPath,
        projectName,
        jsonlFiles.length,
        null,
      );

      const diskSessionIds = new Set<string>();
      let lastActivity: string | null = null;

      for (const file of jsonlFiles) {
        const filePath = path.join(projectPath, file);
        const sessionId = path.basename(file, ".jsonl");
        diskSessionIds.add(sessionId);

        let stat: fs.Stats;
        try {
          stat = fs.statSync(filePath);
        } catch {
          continue;
        }

        // Only process if the file is newer than last index
        if (stat.mtime <= lastIndexedAt && existingSessionIds.has(sessionId)) {
          continue;
        }

        const modified = stat.mtime.toISOString();
        const created = stat.birthtime.toISOString();
        if (!lastActivity || modified > lastActivity) {
          lastActivity = modified;
        }

        const { slug, firstPrompt } = readJsonlHead(filePath);

        stmts.insertSession.run(
          sessionId,
          projectDir.name,
          slug,
          firstPrompt,
          0,
          null,
          derivedPathInc, // project_path derived from directory name
          created,
          modified,
          filePath,
        );
        sessionCount++;
      }

      // Discover subagent files
      const subagentFiles = discoverSubagentFiles(projectPath);
      for (const sub of subagentFiles) {
        diskSessionIds.add(sub.sessionId);
        if (existingSessionIds.has(sub.sessionId)) continue;
        try {
          const stat = fs.statSync(sub.filePath);
          if (stat.mtime <= lastIndexedAt) continue;
          stmts.insertSession.run(
            sub.sessionId,
            projectDir.name,
            null,
            null,
            0,
            null,
            null,
            stat.birthtime.toISOString(),
            stat.mtime.toISOString(),
            sub.filePath,
          );
          sessionCount++;
        } catch {
          /* skip */
        }
      }

      // Delete orphaned sessions
      for (const existingId of existingSessionIds) {
        if (!diskSessionIds.has(existingId)) {
          deleteSession.run(existingId);
          deletedSessions++;
        }
      }

      // Update project with last_activity_at now that we've scanned all files
      if (lastActivity) {
        stmts.insertProject.run(
          projectDir.name,
          projectPath,
          projectName,
          jsonlFiles.length,
          lastActivity,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Codex incremental discovery
  // -------------------------------------------------------------------------
  try {
    const codexEntries = discoverCodexSessions();
    if (codexEntries.length > 0) {
      diskProjectIds.add("codex-sessions");
      let codexLastActivity: string | null = null;
      const existingCodexIds = new Set(
        (
          db
            .prepare("SELECT id FROM sessions WHERE project_id = ?")
            .all("codex-sessions") as { id: string }[]
        ).map((r) => r.id),
      );
      const codexDiskIds = new Set<string>();

      for (const entry of codexEntries) {
        if (!codexLastActivity || entry.modifiedAt > codexLastActivity)
          codexLastActivity = entry.modifiedAt;
        codexDiskIds.add(entry.sessionId);

        // Skip sessions that haven't changed
        if (
          existingCodexIds.has(entry.sessionId) &&
          new Date(entry.modifiedAt) <= lastIndexedAt
        )
          continue;

        stmts.insertSession.run(
          entry.sessionId,
          "codex-sessions",
          null,
          null,
          0,
          null,
          null,
          entry.createdAt,
          entry.modifiedAt,
          entry.filePath,
        );
        sessionCount++;
      }

      stmts.insertProject.run(
        "codex-sessions",
        CODEX_HOME,
        "Codex CLI",
        codexEntries.length,
        codexLastActivity,
      );
      projectCount++;

      // Delete orphaned Codex sessions
      for (const existingId of existingCodexIds) {
        if (!codexDiskIds.has(existingId)) {
          deleteSession.run(existingId);
          deletedSessions++;
        }
      }
    } else {
      diskProjectIds.add("codex-sessions");
    }
  } catch {
    // Codex directory may not exist
  }

  // -------------------------------------------------------------------------
  // Gemini incremental discovery
  // -------------------------------------------------------------------------
  try {
    const geminiEntries = discoverGeminiSessions();
    if (geminiEntries.length > 0) {
      diskProjectIds.add("gemini-sessions");
      let geminiLastActivity: string | null = null;
      const existingGeminiIds = new Set(
        (
          db
            .prepare("SELECT id FROM sessions WHERE project_id = ?")
            .all("gemini-sessions") as { id: string }[]
        ).map((r) => r.id),
      );
      const geminiDiskIds = new Set<string>();

      for (const entry of geminiEntries) {
        if (!geminiLastActivity || entry.modifiedAt > geminiLastActivity)
          geminiLastActivity = entry.modifiedAt;
        const sessionId = `gemini-${entry.projectHash}-${entry.sessionName}`;
        geminiDiskIds.add(sessionId);

        if (
          existingGeminiIds.has(sessionId) &&
          new Date(entry.modifiedAt) <= lastIndexedAt
        )
          continue;

        stmts.insertSession.run(
          sessionId,
          "gemini-sessions",
          null,
          null,
          0,
          null,
          entry.projectPath ?? null,
          entry.createdAt,
          entry.modifiedAt,
          entry.filePath,
        );
        sessionCount++;
      }

      stmts.insertProject.run(
        "gemini-sessions",
        GEMINI_TMP_DIR,
        "Gemini CLI",
        geminiEntries.length,
        geminiLastActivity,
      );
      projectCount++;

      // Delete orphaned Gemini sessions
      for (const existingId of existingGeminiIds) {
        if (!geminiDiskIds.has(existingId)) {
          deleteSession.run(existingId);
          deletedSessions++;
        }
      }
    } else {
      diskProjectIds.add("gemini-sessions");
    }
  } catch {
    // Gemini directory may not exist
  }

  // Delete projects that no longer exist on disk
  const dbProjects = db.prepare("SELECT id FROM projects").all() as {
    id: string;
  }[];
  for (const proj of dbProjects) {
    if (!diskProjectIds.has(proj.id)) {
      db.prepare("DELETE FROM sessions WHERE project_id = ?").run(proj.id);
      db.prepare("DELETE FROM projects WHERE id = ?").run(proj.id);
    }
  }

  // Second pass: aggregate changed sessions only
  const forceReaggregate = shouldForceReaggregate(db);

  const sessionsToAggregate = forceReaggregate
    ? (db
        .prepare(
          "SELECT id, jsonl_path, input_tokens, modified_at, project_id, project_path FROM sessions",
        )
        .all() as AggregationSession[])
    : (db
        .prepare(
          `SELECT id, jsonl_path, input_tokens, modified_at, project_id, project_path FROM sessions
           WHERE modified_at > ?`,
        )
        .all(row.value) as AggregationSession[]);

  await runAggregationPass(db, sessionsToAggregate, stmts, {
    batchDelay,
    forceReaggregate,
    filterFn: (sess, hasLinks) => {
      try {
        const stat = fs.statSync(sess.jsonl_path);
        if (stat.mtime.toISOString() <= sess.modified_at) {
          // JSONL unchanged — only re-process if missing instruction links
          return !hasLinks;
        }
      } catch {
        // Can't stat — only re-process if missing links
        return !hasLinks;
      }
      return true;
    },
  });

  return { projectCount, sessionCount, skippedProjects, deletedSessions };
}

/**
 * Heuristically link subagent sessions to their parent sessions.
 * Matches by project_id and time overlap: the subagent's created_at falls
 * within the parent session's [created_at, modified_at] window.
 */
function linkParentSessions(): number {
  const db = getDb();

  // Bail if the column hasn't been migrated yet
  const cols = db.prepare("PRAGMA table_info(sessions)").all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === "parent_session_id")) return 0;

  const unlinkedSubagents = db
    .prepare(
      `
    SELECT id, project_id, created_at FROM sessions
    WHERE session_role = 'subagent' AND parent_session_id IS NULL
  `,
    )
    .all() as { id: string; project_id: string; created_at: string }[];

  if (unlinkedSubagents.length === 0) return 0;

  const parentSessions = db
    .prepare(
      `
    SELECT id, project_id, created_at, modified_at, enriched_tools FROM sessions
    WHERE COALESCE(session_role, 'standalone') != 'subagent' AND enriched_tools IS NOT NULL
  `,
    )
    .all() as {
    id: string;
    project_id: string;
    created_at: string;
    modified_at: string;
    enriched_tools: string;
  }[];

  // Index parent-session candidates by project_id
  const parentByProject = new Map<string, typeof parentSessions>();
  for (const candidate of parentSessions) {
    const list = parentByProject.get(candidate.project_id) || [];
    list.push(candidate);
    parentByProject.set(candidate.project_id, list);
  }

  const updateStmt = db.prepare(
    "UPDATE sessions SET parent_session_id = ?, subagent_type = ? WHERE id = ?",
  );

  let linked = 0;

  for (const sub of unlinkedSubagents) {
    const candidates = parentByProject.get(sub.project_id);
    if (!candidates) continue;

    // Find parent session whose time range contains the subagent's created_at
    let bestParent: (typeof parentSessions)[0] | null = null;
    let bestDist = Infinity;

    for (const candidate of candidates) {
      if (
        candidate.created_at <= sub.created_at &&
        candidate.modified_at >= sub.created_at
      ) {
        const dist =
          new Date(sub.created_at).getTime() -
          new Date(candidate.created_at).getTime();
        if (dist < bestDist) {
          bestDist = dist;
          bestParent = candidate;
        }
      }
    }

    if (!bestParent) continue;

    // Extract subagent_type from the parent session's enriched_tools.agents
    let subagentType: string | null = null;
    try {
      const enriched = JSON.parse(bestParent.enriched_tools);
      const agents = enriched.agents as
        | { type: string; description: string }[]
        | undefined;
      if (agents && agents.length > 0) {
        subagentType = agents.length === 1 ? agents[0].type : agents[0].type;
      }
    } catch {
      /* ignore parse errors */
    }

    updateStmt.run(bestParent.id, subagentType, sub.id);
    linked++;
  }

  if (linked > 0) {
    indexerLog.info("linked subagent sessions to parents", { count: linked });
  }

  // Post-link fix: ensure any session with a parent is marked as subagent
  const fixedRoles = db
    .prepare(
      `
    UPDATE sessions SET session_role = 'subagent'
    WHERE parent_session_id IS NOT NULL AND session_role != 'subagent'
  `,
    )
    .run();
  if (fixedRoles.changes > 0) {
    indexerLog.info("fixed session_role for linked subagents", {
      count: fixedRoles.changes,
    });
  }

  return linked;
}

/**
 * Delete all indexed data and perform a full rebuild from scratch.
 * Useful when the database is corrupted or schema changes require a clean slate.
 */
export async function nukeAndRebuild(options?: {
  batchDelay?: number;
}): Promise<{
  projectCount: number;
  sessionCount: number;
}> {
  const db = getDb();
  db.exec("DELETE FROM session_instruction_files");
  db.exec("DELETE FROM sessions");
  db.exec("DELETE FROM projects");
  db.exec("DELETE FROM index_metadata WHERE key = 'last_indexed_at'");
  return rebuildIndex({ batchDelay: options?.batchDelay ?? 100 });
}
