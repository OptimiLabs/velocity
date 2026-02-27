import { NextResponse } from "next/server";
import { getDb, ensureIndexed } from "@/lib/db";
import { deleteSessionsWithCleanup } from "@/lib/db/session-deletion";
import { jsonWithCache } from "@/lib/api/cache-headers";
import { buildProviderFilter } from "@/lib/api/provider-filter";
import { refreshProjectAggregates } from "@/lib/db/project-aggregates";
import fs from "fs";

interface SessionRow {
  id: string;
  project_id: string | null;
  parent_session_id: string | null;
  session_role: string | null;
  [key: string]: unknown;
}

function normalizeSessionRow<T extends SessionRow>(row: T): T {
  if (row.session_role === "subagent") return row;
  return { ...row, session_role: "standalone" } as T;
}

function normalizeSessionRows<T extends SessionRow>(rows: T[]): T[] {
  return rows.map(normalizeSessionRow);
}

const SORT_COLUMNS: Record<string, string> = {
  modified_at: "s.modified_at",
  created_at: "s.created_at",
  cost: "s.total_cost",
  messages: "s.message_count",
  tokens:
    "(s.input_tokens + s.output_tokens + s.cache_read_tokens + s.cache_write_tokens)",
  input: "s.input_tokens",
  output: "s.output_tokens",
  cache_read: "s.cache_read_tokens",
  cache_write: "s.cache_write_tokens",
};

export async function GET(request: Request) {
  try {
    await ensureIndexed();
  } catch (error) {
    console.error(
      "[sessions] ensureIndexed failed during GET; continuing with current DB state",
      error,
    );
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const search = searchParams.get("search");
  const sortBy = searchParams.get("sortBy") || "modified_at";
  const sortDir = searchParams.get("sortDir") || "DESC";
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const model = searchParams.get("model");
  const modelOp = searchParams.get("modelOp") === "and" ? "AND" : "OR";
  const costMin = searchParams.get("costMin");
  const costMax = searchParams.get("costMax");
  const groupByProject = searchParams.get("groupByProject") === "true";
  const groupByTask = searchParams.get("groupByTask") === "true";
  const role = searchParams.get("role");
  const ids = searchParams.get("ids");
  const effortMode = searchParams.get("effortMode");
  const includeSummary = searchParams.get("includeSummary") === "true";
  const compressionStateRaw = searchParams.get("compressionState");
  const compressionState =
    compressionStateRaw === "compressed" ||
    compressionStateRaw === "all" ||
    compressionStateRaw === "active"
      ? compressionStateRaw
      : "active";
  const db = getDb();
  const hasEffortModeColumn = (() => {
    try {
      const columns = db.prepare("PRAGMA table_info(sessions)").all() as Array<{
        name: string;
      }>;
      return columns.some((column) => column.name === "effort_mode");
    } catch {
      return false;
    }
  })();

  // Distinct agent types — lightweight early return
  if (searchParams.get("distinctAgentTypes") === "true") {
    const pAnd = buildProviderFilter(searchParams);
    const types = db
      .prepare(
        `SELECT DISTINCT subagent_type FROM sessions WHERE subagent_type IS NOT NULL ${pAnd.sql} ORDER BY subagent_type`,
      )
      .all(...pAnd.params) as { subagent_type: string }[];
    return jsonWithCache(
      { agentTypes: types.map((t) => t.subagent_type) },
      "list",
    );
  }

  // Batch fetch by IDs — early return before filter logic
  if (ids) {
    const idList = ids.split(",").filter(Boolean);
    if (idList.length === 0)
      return jsonWithCache({ sessions: [], total: 0 }, "list");
    const placeholders = idList.map(() => "?").join(",");
    const sessions = normalizeSessionRows(
      db
        .prepare(`SELECT * FROM sessions WHERE id IN (${placeholders})`)
        .all(...idList) as SessionRow[],
    );
    return jsonWithCache({ sessions, total: sessions.length }, "list");
  }

  const conditions: string[] = ["message_count > 0"];
  const params: (string | number)[] = [];
  if (compressionState === "active") {
    conditions.push("compressed_at IS NULL");
  } else if (compressionState === "compressed") {
    conditions.push("compressed_at IS NOT NULL");
  }

  if (projectId) {
    conditions.push("project_id = ?");
    params.push(projectId);
  }

  if (search) {
    conditions.push("(slug LIKE '%' || ? || '%' OR id LIKE '%' || ? || '%' OR first_prompt LIKE '%' || ? || '%')");
    params.push(search, search, search);
  }

  if (dateFrom) {
    conditions.push("created_at >= ?");
    params.push(dateFrom);
  }

  if (dateTo) {
    conditions.push("created_at <= ?");
    params.push(dateTo.includes("T") ? dateTo : dateTo + "T23:59:59");
  }

  if (model) {
    const models = model.split(",").filter(Boolean);
    if (models.length === 1) {
      conditions.push("model_usage LIKE '%' || ? || '%'");
      params.push(models[0]);
    } else if (models.length > 1) {
      const clauses = models.map(() => "model_usage LIKE '%' || ? || '%'");
      conditions.push(`(${clauses.join(` ${modelOp} `)})`);
      params.push(...models);
    }
  }

  if (costMin) {
    conditions.push("total_cost > ?");
    params.push(parseFloat(costMin));
  }

  if (costMax) {
    conditions.push("total_cost <= ?");
    params.push(parseFloat(costMax));
  }

  const minMessages = searchParams.get("minMessages");
  if (minMessages) {
    conditions.push("message_count >= ?");
    params.push(parseInt(minMessages, 10));
  }

  if (role) {
    const roles = role.split(",").filter(Boolean);
    if (roles.length === 1) {
      if (roles[0] === "standalone") {
        conditions.push("COALESCE(session_role, 'standalone') != 'subagent'");
      } else {
        conditions.push("session_role = ?");
        params.push(roles[0]);
      }
    } else if (roles.length > 1) {
      // Multiple roles — no filter needed
    }
  }

  const provider = searchParams.get("provider");
  if (provider) {
    conditions.push("COALESCE(provider, 'claude') = ?");
    params.push(provider);
  }

  const agentType = searchParams.get("agentType");
  if (agentType) {
    const types = agentType.split(",").filter(Boolean);
    if (types.length === 1) {
      conditions.push("subagent_type = ?");
      params.push(types[0]);
    } else if (types.length > 1) {
      conditions.push(`subagent_type IN (${types.map(() => "?").join(",")})`);
      params.push(...types);
    }
  }

  if (effortMode && hasEffortModeColumn) {
    const modes = effortMode
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (modes.length === 1) {
      conditions.push("LOWER(COALESCE(effort_mode, '')) = ?");
      params.push(modes[0]);
    } else if (modes.length > 1) {
      conditions.push(
        `LOWER(COALESCE(effort_mode, '')) IN (${modes.map(() => "?").join(",")})`,
      );
      params.push(...modes);
    }
  }

  const whereClause =
    conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
  const sortColumn = SORT_COLUMNS[sortBy];
  if (!sortColumn) {
    return NextResponse.json(
      { error: `Invalid sort column: ${sortBy}` },
      { status: 400 },
    );
  }
  const direction = sortDir === "ASC" ? "ASC" : "DESC";

  if (groupByProject) {
    // Provider filter for JOIN context (requires table alias)
    const pAnd = buildProviderFilter(searchParams, { tableAlias: "s" });

    // Single query: projects with aggregate stats
    const projects = db
      .prepare(
        `
      SELECT p.*,
        COUNT(s.id) as session_count,
        COALESCE(SUM(s.total_cost), 0) as total_cost,
        COALESCE(
          SUM(
            s.input_tokens +
              s.output_tokens +
              s.cache_read_tokens +
              s.cache_write_tokens
          ),
          0
        ) as total_tokens
      FROM projects p
      LEFT JOIN sessions s ON s.project_id = p.id AND s.message_count > 0
        ${
          compressionState === "compressed"
            ? "AND s.compressed_at IS NOT NULL"
            : compressionState === "active"
              ? "AND s.compressed_at IS NULL"
              : ""
        }
        ${pAnd.sql}
      GROUP BY p.id
      ORDER BY p.last_activity_at DESC
      LIMIT 200
    `,
      )
      .all(...pAnd.params) as Array<Record<string, unknown>>;

    // Single query: top 10 sessions per project using window function
    const projectIds = projects.map((p) => p.id);
    let allSessions: Array<Record<string, unknown>> = [];
    if (projectIds.length > 0) {
      const placeholders = projectIds.map(() => "?").join(",");
      allSessions = normalizeSessionRows(
        db.prepare(
          `
        SELECT * FROM (
          SELECT s.*,
            ROW_NUMBER() OVER (PARTITION BY s.project_id ORDER BY ${sortColumn} ${direction}) as rn
          FROM sessions s
          WHERE s.project_id IN (${placeholders}) AND s.message_count > 0
            ${
              compressionState === "compressed"
                ? "AND s.compressed_at IS NOT NULL"
                : compressionState === "active"
                  ? "AND s.compressed_at IS NULL"
                  : ""
            }
            ${pAnd.sql}
        ) sub
        WHERE rn <= 10
      `,
        )
          .all(...projectIds, ...pAnd.params) as SessionRow[],
      ) as Array<Record<string, unknown>>;
    }

    // Group sessions by project in JS
    const sessionsByProject = new Map<unknown, Array<Record<string, unknown>>>();
    for (const s of allSessions) {
      const list = sessionsByProject.get(s.project_id) || [];
      list.push(s);
      sessionsByProject.set(s.project_id, list);
    }

    const grouped = projects.map((project) => ({
      ...project,
      sessions: sessionsByProject.get(project.id) || [],
    }));

    const countQuery = `SELECT COUNT(*) as count FROM sessions${whereClause}`;
    const { count } = db.prepare(countQuery).get(...params) as {
      count: number;
    };

    return jsonWithCache({ grouped, total: count }, "list");
  }

  if (groupByTask) {
    // Only top-level sessions
    const taskConditions = [
      ...conditions,
      "COALESCE(session_role, 'standalone') != 'subagent'",
    ];
    const taskWhere = " WHERE " + taskConditions.join(" AND ");

    const query = `SELECT s.* FROM sessions s${taskWhere} ORDER BY ${sortColumn} ${direction} LIMIT ? OFFSET ?`;
    const sessions = normalizeSessionRows(
      db.prepare(query).all(...params, limit, offset) as SessionRow[],
    );

    const countQuery = `SELECT COUNT(*) as count FROM sessions${taskWhere}`;
    const { count } = db.prepare(countQuery).get(...params) as {
      count: number;
    };

    // Fetch children for parent sessions (any non-subagent that may have spawned subagents)
    const typedSessions = sessions as SessionRow[];
    const parentIds = typedSessions
      .filter((s) => s.session_role !== "subagent")
      .map((s) => s.id);

    const childrenMap = new Map<string, SessionRow[]>();
    if (parentIds.length > 0) {
      const placeholders = parentIds.map(() => "?").join(",");
      const children = normalizeSessionRows(
        db
          .prepare(
            `SELECT * FROM sessions WHERE parent_session_id IN (${placeholders}) ${
              compressionState === "compressed"
                ? "AND compressed_at IS NOT NULL"
                : compressionState === "active"
                  ? "AND compressed_at IS NULL"
                  : ""
            } ORDER BY created_at ASC`,
          )
          .all(...parentIds) as SessionRow[],
      );
      for (const child of children) {
        const pid = child.parent_session_id!;
        const list = childrenMap.get(pid) || [];
        list.push(child);
        childrenMap.set(pid, list);
      }
    }

    const tasked = typedSessions.map((s) => ({
      ...s,
      children: childrenMap.get(s.id) || [],
    }));

    return jsonWithCache({ sessions: tasked, total: count }, "list");
  }

  const query = `SELECT s.* FROM sessions s${whereClause} ORDER BY ${sortColumn} ${direction} LIMIT ? OFFSET ?`;
  const sessions = normalizeSessionRows(
    db.prepare(query).all(...params, limit, offset) as SessionRow[],
  );

  if (includeSummary) {
    const summaryQuery = `SELECT COUNT(*) as total_sessions, COALESCE(SUM(total_cost), 0) as total_cost, COALESCE(SUM(message_count), 0) as total_messages, COALESCE(AVG(total_cost), 0) as avg_cost FROM sessions${whereClause}`;
    const summary = db.prepare(summaryQuery).get(...params) as {
      total_sessions: number;
      total_cost: number;
      total_messages: number;
      avg_cost: number;
    };
    return jsonWithCache(
      { sessions, total: summary.total_sessions, summary },
      "list",
    );
  }

  const countQuery = `SELECT COUNT(*) as count FROM sessions${whereClause}`;
  const { count } = db.prepare(countQuery).get(...params) as { count: number };

  return jsonWithCache({ sessions, total: count }, "list");
}

export async function DELETE(request: Request) {
  try {
    await ensureIndexed();
  } catch (error) {
    console.error(
      "[sessions] ensureIndexed failed during DELETE; continuing with current DB state",
      error,
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { ids?: unknown; deleteFiles?: unknown }
    | null;
  const ids = Array.isArray(body?.ids)
    ? body.ids
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    : [];
  const deleteFiles = body?.deleteFiles !== false;

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "ids array is required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const uniqueIds = Array.from(new Set(ids));
  const chunkSize = 900;

  const rows: Array<{ id: string; jsonl_path: string }> = [];
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");
    const chunkRows = db
      .prepare(
        `SELECT id, jsonl_path FROM sessions WHERE id IN (${placeholders})`,
      )
      .all(...chunk) as Array<{ id: string; jsonl_path: string }>;
    rows.push(...chunkRows);
  }

  if (rows.length === 0) {
    return NextResponse.json({ success: true, deleted: 0, fileDeletes: { deleted: 0, failed: 0 } });
  }

  let deletedFiles = 0;
  const failedFileDeletes: Array<{ id: string; path: string; error: string }> = [];
  if (deleteFiles) {
    for (const row of rows) {
      try {
        if (row.jsonl_path && fs.existsSync(row.jsonl_path)) {
          fs.unlinkSync(row.jsonl_path);
          deletedFiles++;
        }
      } catch (e) {
        failedFileDeletes.push({
          id: row.id,
          path: row.jsonl_path,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }
  }

  const cleanup = deleteSessionsWithCleanup(rows.map((row) => row.id));

  return NextResponse.json({
    success: true,
    deleted: cleanup.deletedSessions,
    fileDeletes: {
      deleted: deletedFiles,
      failed: failedFileDeletes.length,
    },
    failedFileDeletes: failedFileDeletes.slice(0, 20),
    detachedInstructionLinks: cleanup.detachedInstructionLinks,
    updatedAnalysisConversations: cleanup.updatedAnalysisConversations,
    deletedAnalysisConversations: cleanup.deletedAnalysisConversations,
  });
}

export async function PATCH(request: Request) {
  try {
    await ensureIndexed();
  } catch (error) {
    console.error(
      "[sessions] ensureIndexed failed during PATCH; continuing with current DB state",
      error,
    );
  }

  function normalizeFromDateInput(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return `${trimmed}T00:00:00.000Z`;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  }

  const body = (await request.json().catch(() => null)) as
    | {
        ids?: unknown;
        action?: unknown;
        fromDate?: unknown;
        projectId?: unknown;
        provider?: unknown;
      }
    | null;
  const ids = Array.isArray(body?.ids)
    ? body.ids
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    : [];
  const fromDateRaw =
    typeof body?.fromDate === "string" ? body.fromDate.trim() : "";
  const fromDate = fromDateRaw ? normalizeFromDateInput(fromDateRaw) : null;
  const projectId =
    typeof body?.projectId === "string" && body.projectId.trim()
      ? body.projectId.trim()
      : undefined;
  const provider =
    typeof body?.provider === "string" && body.provider.trim()
      ? body.provider.trim()
      : undefined;
  const action =
    body?.action === "compress" || body?.action === "restore"
      ? body.action
      : null;

  if (!action) {
    return NextResponse.json(
      { error: "action must be 'compress' or 'restore'" },
      { status: 400 },
    );
  }
  if (ids.length === 0 && !fromDateRaw) {
    return NextResponse.json(
      { error: "ids array or fromDate is required" },
      { status: 400 },
    );
  }
  if (fromDateRaw && !fromDate) {
    return NextResponse.json(
      { error: "fromDate must be a valid date string" },
      { status: 400 },
    );
  }

  const db = getDb();
  const uniqueIds = Array.from(new Set(ids));
  const chunkSize = 900;
  const now = new Date().toISOString();

  const updateTx = db.transaction((sessionIds: string[]) => {
    let updated = 0;
    for (let i = 0; i < sessionIds.length; i += chunkSize) {
      const chunk = sessionIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(",");
      const result =
        action === "compress"
          ? db
              .prepare(
                `UPDATE sessions SET compressed_at = ? WHERE id IN (${placeholders}) AND compressed_at IS NULL`,
              )
              .run(now, ...chunk)
          : db
              .prepare(
                `UPDATE sessions SET compressed_at = NULL WHERE id IN (${placeholders}) AND compressed_at IS NOT NULL`,
              )
              .run(...chunk);
      updated += result.changes;
    }
    return updated;
  });

  const updateFromDateTx = db.transaction(
    (dateFrom: string, filterProjectId?: string, filterProvider?: string) => {
      const conditions = ["message_count > 0", "created_at >= ?"];
      const params: (string | number)[] = [dateFrom];
      if (filterProjectId) {
        conditions.push("project_id = ?");
        params.push(filterProjectId);
      }
      if (filterProvider) {
        conditions.push("COALESCE(provider, 'claude') = ?");
        params.push(filterProvider);
      }
      if (action === "compress") {
        conditions.push("compressed_at IS NULL");
      } else {
        conditions.push("compressed_at IS NOT NULL");
      }
      const whereClause = conditions.join(" AND ");
      if (action === "compress") {
        return db
          .prepare(`UPDATE sessions SET compressed_at = ? WHERE ${whereClause}`)
          .run(now, ...params).changes;
      }
      return db
        .prepare(`UPDATE sessions SET compressed_at = NULL WHERE ${whereClause}`)
        .run(...params).changes;
    },
  );

  const updated =
    uniqueIds.length > 0
      ? updateTx(uniqueIds)
      : updateFromDateTx(fromDate!, projectId, provider);
  const projectAggregates =
    updated > 0 ? refreshProjectAggregates({ activeOnly: true }) : null;
  return NextResponse.json({
    success: true,
    action,
    updated,
    ...(projectAggregates ? { projectAggregates } : {}),
    ...(uniqueIds.length > 0
      ? { mode: "ids" as const }
      : { mode: "fromDate" as const, fromDate }),
  });
}
