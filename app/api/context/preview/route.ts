import { NextResponse } from "next/server";
import { getDb, ensureIndexed } from "@/lib/db";
import {
  shortenPath,
  resolveProjectRealPath,
  isClaudeMdRelevant,
} from "@/lib/context/helpers";

const FILE_TYPE_ORDER: Record<string, number> = {
  "CLAUDE.md": 0,
  "knowledge.md": 1,
  skill: 2,
  agent: 3,
};

const FILE_TYPE_LABELS: Record<string, string> = {
  "CLAUDE.md": "CLAUDE.md",
  "knowledge.md": "Knowledge",
  skill: "Skills",
  agent: "Agents",
};

export async function GET(request: Request) {
  await ensureIndexed();
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }

  const db = getDb();

  // Resolve the project's real filesystem path for hierarchy-based filtering
  const realProjectPath = resolveProjectRealPath(db, projectId);

  // Fetch non-CLAUDE.md files with the existing project_id logic
  const nonClaudeRows = db
    .prepare(
      `
      SELECT
        id, file_path, file_type, file_name, content,
        token_count, project_id
      FROM instruction_files
      WHERE is_active = 1
        AND file_type != 'CLAUDE.md'
        AND (project_id IS NULL OR project_id = ?)
      ORDER BY
        CASE file_type
          WHEN 'knowledge.md' THEN 1
          WHEN 'skill' THEN 2
          WHEN 'agent' THEN 3
          ELSE 4
        END,
        CASE WHEN project_id IS NULL THEN 0 ELSE 1 END,
        file_path
    `,
    )
    .all(projectId) as {
    id: string;
    file_path: string;
    file_type: string;
    file_name: string;
    content: string;
    token_count: number;
    project_id: string | null;
  }[];

  // Fetch ALL active CLAUDE.md files, then filter by hierarchy
  const allClaudeRows = db
    .prepare(
      `
      SELECT
        id, file_path, file_type, file_name, content,
        token_count, project_id
      FROM instruction_files
      WHERE is_active = 1
        AND file_type = 'CLAUDE.md'
      ORDER BY
        CASE WHEN project_id IS NULL THEN 0 ELSE 1 END,
        file_path
    `,
    )
    .all() as {
    id: string;
    file_path: string;
    file_type: string;
    file_name: string;
    content: string;
    token_count: number;
    project_id: string | null;
  }[];

  // Filter CLAUDE.md files: only include those in the project's ancestor chain
  const claudeRows = realProjectPath
    ? allClaudeRows.filter((row) =>
        isClaudeMdRelevant(row.file_path, realProjectPath),
      )
    : allClaudeRows.filter(
        (row) => !row.project_id || row.project_id === projectId,
      );

  const rows = [...claudeRows, ...nonClaudeRows];

  // Group by file type
  const sectionMap = new Map<
    string,
    {
      type: string;
      label: string;
      files: {
        id: string;
        filePath: string;
        shortPath: string;
        fileName: string;
        fileType: string;
        content: string;
        tokenCount: number;
        isGlobal: boolean;
      }[];
      totalTokens: number;
    }
  >();

  let totalFiles = 0;
  let totalTokens = 0;
  let globalTokens = 0;
  let projectTokens = 0;

  for (const row of rows) {
    const isGlobal = !row.project_id;
    const fileType = row.file_type;

    if (!sectionMap.has(fileType)) {
      sectionMap.set(fileType, {
        type: fileType,
        label: FILE_TYPE_LABELS[fileType] ?? fileType,
        files: [],
        totalTokens: 0,
      });
    }

    const section = sectionMap.get(fileType)!;
    section.files.push({
      id: row.id,
      filePath: row.file_path,
      shortPath: shortenPath(row.file_path),
      fileName: row.file_name,
      fileType: row.file_type,
      content: row.content,
      tokenCount: row.token_count,
      isGlobal,
    });
    section.totalTokens += row.token_count;

    totalFiles++;
    totalTokens += row.token_count;
    if (isGlobal) {
      globalTokens += row.token_count;
    } else {
      projectTokens += row.token_count;
    }
  }

  // Sort sections by file type order
  const sections = Array.from(sectionMap.values()).sort((a, b) => {
    const orderA = FILE_TYPE_ORDER[a.type] ?? 99;
    const orderB = FILE_TYPE_ORDER[b.type] ?? 99;
    return orderA - orderB;
  });

  return NextResponse.json({
    sections,
    totals: {
      totalFiles,
      totalTokens,
      globalTokens,
      projectTokens,
    },
  });
}
