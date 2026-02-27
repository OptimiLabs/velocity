import { NextResponse } from "next/server";
import { getDb, ensureIndexed } from "@/lib/db";
import { buildAnalyticsFilters } from "@/lib/api/analytics-filters";
import { parseConfigProvider } from "@/lib/providers/mcp-settings";

function shortenPath(filePath: string): string {
  return filePath
    .replace(/^\/Users\/[^/]+/, "~")
    .replace(/~\/.claude\/knowledge\//, "knowledge/")
    .replace(/~\/.claude\/projects\/[^/]+\//, "project:/");
}

function extractProjectName(projectPath: string): string {
  const parts = projectPath.replace(/\/$/, "").split("/");
  return parts[parts.length - 1] || projectPath;
}

export async function GET(request: Request) {
  await ensureIndexed();
  const { searchParams } = new URL(request.url);
  const rawFrom = searchParams.get("from") || "2025-01-01";
  const rawTo = searchParams.get("to") || new Date().toISOString().split("T")[0];
  const from = rawFrom.split("T")[0];
  const to = rawTo.split("T")[0];
  const provider =
    parseConfigProvider(searchParams.get("provider") ?? null) ?? null;

  const { sql: filterSql, params: filterParams } =
    buildAnalyticsFilters(searchParams, "s");
  const instructionProviderFilterSql = provider ? " AND inf.provider = ?" : "";
  const instructionProviderFilterParams = provider ? [provider] : [];

  const db = getDb();

  // 1. Get instruction files with real session counts from the junction table
  const instructionRows = db
    .prepare(
      `
      SELECT
        inf.id, inf.file_path, inf.file_type, inf.file_name, inf.token_count,
        inf.project_path, inf.is_active,
        COUNT(DISTINCT sif.session_id) as session_count,
        GROUP_CONCAT(DISTINCT sif.detection_method) as detection_methods
      FROM instruction_files inf
      LEFT JOIN session_instruction_files sif ON inf.id = sif.instruction_id
      LEFT JOIN sessions s ON sif.session_id = s.id
        AND DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
        ${filterSql}
      WHERE inf.is_active = 1
        ${instructionProviderFilterSql}
      GROUP BY inf.id
    `,
    )
    .all(from, to, ...filterParams, ...instructionProviderFilterParams) as {
    id: string;
    file_path: string;
    file_type: string;
    file_name: string;
    token_count: number;
    project_path: string | null;
    is_active: number;
    session_count: number;
    detection_methods: string | null;
  }[];

  // 2. Get total sessions in date range
  const totalSessionsRow = db
    .prepare(
      `
      SELECT COUNT(*) as cnt FROM sessions s
      WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
        ${filterSql}
    `,
    )
    .get(from, to, ...filterParams) as { cnt: number };
  const totalSessions = totalSessionsRow.cnt;

  // 3. Build flat file list with session counts + detection methods
  const instructionFiles = instructionRows
    .map((row) => ({
      filePath: row.file_path,
      shortPath: shortenPath(row.file_path),
      fileName: row.file_name,
      fileType: row.file_type,
      tokenCount: row.token_count,
      isGlobal: !row.project_path,
      sessionCount: row.session_count,
      detectionMethod: row.detection_methods
        ? row.detection_methods.split(",")[0]
        : null,
    }))
    .sort(
      (a, b) => b.sessionCount - a.sessionCount || b.tokenCount - a.tokenCount,
    );

  // 4. Build per-project breakdown using junction table
  const projectRows = db
    .prepare(
      `
      SELECT s.project_path, COUNT(DISTINCT s.id) as session_count
      FROM sessions s
      WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
        AND s.project_path IS NOT NULL
        ${filterSql}
      GROUP BY s.project_path
    `,
    )
    .all(from, to, ...filterParams) as {
    project_path: string;
    session_count: number;
  }[];

  const projectBreakdown: {
    projectPath: string;
    projectName: string;
    sessionCount: number;
    totalInstructionTokens: number;
    globalTokens: number;
    projectTokens: number;
    fileCount: number;
    files: {
      shortPath: string;
      fileType: string;
      tokenCount: number;
      isGlobal: boolean;
      sessionCount: number;
      detectionMethod: string | null;
    }[];
  }[] = [];

  // Batch query: fetch instruction files for ALL projects in one query
  const allProjectPaths = projectRows.map((pr) => pr.project_path);
  const projectSessionMap = new Map(
    projectRows.map((pr) => [pr.project_path, pr.session_count]),
  );

  if (allProjectPaths.length > 0) {
    const placeholders = allProjectPaths.map(() => "?").join(",");
    const allProjectFiles = db
      .prepare(
        `
        SELECT
          s.project_path as session_project_path,
          inf.file_path, inf.file_type, inf.token_count, inf.project_path,
          COUNT(DISTINCT sif.session_id) as session_count,
          GROUP_CONCAT(DISTINCT sif.detection_method) as detection_methods
        FROM session_instruction_files sif
        JOIN sessions s ON sif.session_id = s.id
        JOIN instruction_files inf ON sif.instruction_id = inf.id
        WHERE s.project_path IN (${placeholders})
          AND DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
          ${filterSql}
          ${instructionProviderFilterSql}
        GROUP BY s.project_path, inf.id
      `,
      )
      .all(
        ...allProjectPaths,
        from,
        to,
        ...filterParams,
        ...instructionProviderFilterParams,
      ) as {
      session_project_path: string;
      file_path: string;
      file_type: string;
      token_count: number;
      project_path: string | null;
      session_count: number;
      detection_methods: string | null;
    }[];

    // Group results by project path
    const filesByProject = new Map<
      string,
      typeof allProjectFiles
    >();
    for (const f of allProjectFiles) {
      const arr = filesByProject.get(f.session_project_path) ?? [];
      arr.push(f);
      filesByProject.set(f.session_project_path, arr);
    }

    for (const pp of allProjectPaths) {
      const projectFiles = filesByProject.get(pp) ?? [];
      let globalTokens = 0;
      let projectTokens = 0;
      const files: {
        shortPath: string;
        fileType: string;
        tokenCount: number;
        isGlobal: boolean;
        sessionCount: number;
        detectionMethod: string | null;
      }[] = [];

      for (const f of projectFiles) {
        const isGlobal = !f.project_path;
        if (isGlobal) {
          globalTokens += f.token_count;
        } else {
          projectTokens += f.token_count;
        }
        files.push({
          shortPath: shortenPath(f.file_path),
          fileType: f.file_type,
          tokenCount: f.token_count,
          isGlobal,
          sessionCount: f.session_count,
          detectionMethod: f.detection_methods
            ? f.detection_methods.split(",")[0]
            : null,
        });
      }

      projectBreakdown.push({
        projectPath: pp,
        projectName: extractProjectName(pp),
        sessionCount: projectSessionMap.get(pp) ?? 0,
        totalInstructionTokens: globalTokens + projectTokens,
        globalTokens,
        projectTokens,
        fileCount: files.length,
        files: files.sort(
          (a, b) =>
            b.sessionCount - a.sessionCount || b.tokenCount - a.tokenCount,
        ),
      });
    }
  }

  projectBreakdown.sort(
    (a, b) => b.totalInstructionTokens - a.totalInstructionTokens,
  );

  // 5. Compute avg tokens per session (weighted by actual file linkage)
  const weightedRow = db
    .prepare(
      `
      SELECT COALESCE(SUM(inf.token_count), 0) as weighted_sum
      FROM session_instruction_files sif
      JOIN sessions s ON sif.session_id = s.id
      JOIN instruction_files inf ON sif.instruction_id = inf.id
      WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
        ${filterSql}
        ${instructionProviderFilterSql}
    `,
    )
    .get(
      from,
      to,
      ...filterParams,
      ...instructionProviderFilterParams,
    ) as { weighted_sum: number };

  const avgTokensPerSession =
    totalSessions > 0
      ? Math.round(weightedRow.weighted_sum / totalSessions)
      : 0;
  const usedInstructionFiles = instructionFiles.filter(
    (file) => file.sessionCount > 0,
  );
  const usedInstructionTokens = usedInstructionFiles.reduce(
    (sum, file) => sum + file.tokenCount,
    0,
  );

  return NextResponse.json({
    provider: provider ?? "all",
    instructionFiles,
    projectBreakdown,
    totals: {
      totalInstructionFiles: instructionFiles.length,
      usedInstructionFiles: usedInstructionFiles.length,
      usedInstructionTokens,
      avgTokensPerSession,
      totalSessions,
    },
  });
}
