import { NextResponse } from "next/server";
import { getDb, ensureIndexed } from "@/lib/db";
import { buildAnalyticsFilters } from "@/lib/api/analytics-filters";
import type { FileCategory, FileReadEntry } from "@/types/session";

const CATEGORY_LABELS: Record<FileCategory, string> = {
  knowledge: "Knowledge",
  instruction: "Instructions",
  agent: "Agents",
  code: "Code",
  config: "Config",
  other: "Other",
};

function shortenPath(path: string): string {
  return path
    .replace(/^\/Users\/[^/]+/, "~")
    .replace(/~\/.claude\/knowledge\//, "knowledge/")
    .replace(/~\/.claude\/projects\/[^/]+\//, "project:/");
}

export async function GET(request: Request) {
  await ensureIndexed();
  const { searchParams } = new URL(request.url);
  const rawFrom = searchParams.get("from") || "2025-01-01";
  const rawTo = searchParams.get("to") || new Date().toISOString().split("T")[0];
  const from = rawFrom.split("T")[0];
  const to = rawTo.split("T")[0];

  const { sql: filterSql, params: filterParams } =
    buildAnalyticsFilters(searchParams, "s");

  const db = getDb();

  const rows = db
    .prepare(
      `
    SELECT s.enriched_tools, s.tool_usage, s.project_path, p.name as project_name
    FROM sessions s
    LEFT JOIN projects p ON s.project_id = p.id
    WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
      AND s.enriched_tools IS NOT NULL AND s.enriched_tools != ''
      ${filterSql}
  `,
    )
    .all(from, to, ...filterParams) as {
    enriched_tools: string;
    tool_usage: string;
    project_path: string | null;
    project_name: string | null;
  }[];

  // Aggregate per-file stats
  const fileStats = new Map<
    string,
    {
      path: string;
      category: FileCategory;
      totalReads: number;
      sessions: Set<number>; // track unique sessions by index
      projectPath: string | null;
      projectName: string | null;
      estimatedTokens: number;
      estimatedCost: number;
    }
  >();

  // Category summaries
  const catStats = new Map<
    FileCategory,
    {
      fileSet: Set<string>;
      totalReads: number;
      sessions: Set<number>;
      estimatedTokens: number;
      estimatedCost: number;
    }
  >();

  let totalReadTokens = 0;
  let totalReadCost = 0;
  let sessionsWithReads = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let enriched: { filesRead?: FileReadEntry[] } | null = null;
    let toolUsage: Record<
      string,
      { totalTokens?: number; estimatedCost?: number }
    > | null = null;

    try {
      enriched = JSON.parse(row.enriched_tools);
    } catch {
      continue;
    }
    try {
      toolUsage = row.tool_usage ? JSON.parse(row.tool_usage) : null;
    } catch {
      /* ignore */
    }

    const filesRead = enriched?.filesRead;
    if (!filesRead || filesRead.length === 0) continue;

    sessionsWithReads++;

    const readTool = toolUsage?.["Read"];
    const sessionReadTokens = readTool?.totalTokens ?? 0;
    const sessionReadCost = readTool?.estimatedCost ?? 0;
    totalReadTokens += sessionReadTokens;
    totalReadCost += sessionReadCost;

    const sessionTotalReads = filesRead.reduce((s, f) => s + f.count, 0);

    for (const entry of filesRead) {
      // Proportional cost for this file in this session
      const fileTokens =
        sessionTotalReads > 0
          ? (entry.count / sessionTotalReads) * sessionReadTokens
          : 0;
      const fileCost =
        sessionTotalReads > 0
          ? (entry.count / sessionTotalReads) * sessionReadCost
          : 0;

      // Per-file aggregation
      const existing = fileStats.get(entry.path);
      if (existing) {
        existing.totalReads += entry.count;
        existing.sessions.add(i);
        existing.estimatedTokens += fileTokens;
        existing.estimatedCost += fileCost;
      } else {
        fileStats.set(entry.path, {
          path: entry.path,
          category: entry.category,
          totalReads: entry.count,
          sessions: new Set([i]),
          projectPath: row.project_path,
          projectName: row.project_name,
          estimatedTokens: fileTokens,
          estimatedCost: fileCost,
        });
      }

      // Per-category aggregation
      const cat = catStats.get(entry.category);

      if (cat) {
        cat.fileSet.add(entry.path);
        cat.totalReads += entry.count;
        cat.sessions.add(i);
        cat.estimatedTokens += fileTokens;
        cat.estimatedCost += fileCost;
      } else {
        catStats.set(entry.category, {
          fileSet: new Set([entry.path]),
          totalReads: entry.count,
          sessions: new Set([i]),
          estimatedTokens: fileTokens,
          estimatedCost: fileCost,
        });
      }
    }
  }

  // Build topFiles (sorted by sessionCount desc, then totalReads desc)
  const topFiles = [...fileStats.values()]
    .map((f) => {
      const sessionCount = f.sessions.size;
      return {
        path: f.path,
        shortPath: shortenPath(f.path),
        category: f.category,
        totalReads: f.totalReads,
        sessionCount,
        projectPath: f.projectPath,
        projectName: f.projectName,
        estimatedTokens: Math.round(f.estimatedTokens),
        estimatedCost: f.estimatedCost,
        sizeBytes: null,
      };
    })
    .sort(
      (a, b) => b.sessionCount - a.sessionCount || b.totalReads - a.totalReads,
    )
    .slice(0, 200);

  // Build categories
  const categories = (
    [
      "knowledge",
      "instruction",
      "agent",
      "config",
      "code",
      "other",
    ] as FileCategory[]
  )
    .filter((c) => catStats.has(c))
    .map((c) => {
      const s = catStats.get(c)!;
      return {
        category: c,
        label: CATEGORY_LABELS[c],
        fileCount: s.fileSet.size,
        totalReads: s.totalReads,
        sessionCount: s.sessions.size,
        estimatedTokens: Math.round(s.estimatedTokens),
        estimatedCost: s.estimatedCost,
      };
    });

  return NextResponse.json({
    topFiles,
    categories,
    totals: {
      uniqueFiles: fileStats.size,
      totalReads: [...fileStats.values()].reduce((s, f) => s + f.totalReads, 0),
      totalReadTokens: Math.round(totalReadTokens),
      totalReadCost,
      sessionsWithReads,
    },
  });
}
