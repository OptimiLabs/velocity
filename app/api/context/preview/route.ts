import { NextResponse } from "next/server";
import { getDb, ensureIndexed } from "@/lib/db";
import {
  shortenPath,
  resolveProjectRealPath,
  isClaudeMdRelevant,
} from "@/lib/context/helpers";
import {
  parseConfigProvider,
} from "@/lib/providers/mcp-settings";
import {
  getRuntimeBaseEstimate,
  resolveIngestionMode,
} from "./logic";

const FILE_TYPE_ORDER: Record<string, number> = {
  "CLAUDE.md": 0,
  "knowledge.md": 1,
  "skill.md": 2,
  skill: 2,
  "agents.md": 3,
  agent: 3,
  "other.md": 4,
};

const FILE_TYPE_LABELS: Record<string, string> = {
  "CLAUDE.md": "CLAUDE.md",
  "knowledge.md": "Knowledge",
  "skill.md": "Skills",
  skill: "Skills",
  "agents.md": "Agents",
  agent: "Agents",
  "other.md": "Other",
};

export async function GET(request: Request) {
  await ensureIndexed();
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const provider =
    parseConfigProvider(searchParams.get("provider") ?? "claude") ?? "claude";

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
        AND provider = ?
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
    .all(provider, projectId) as {
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
        AND provider = ?
        AND file_type = 'CLAUDE.md'
      ORDER BY
        CASE WHEN project_id IS NULL THEN 0 ELSE 1 END,
        file_path
    `,
    )
    .all(provider) as {
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
        ingestionMode: "always" | "on-demand";
      }[];
      totalTokens: number;
      runtimeTokens: number;
      runtimeFiles: number;
      optionalTokens: number;
      optionalFiles: number;
    }
  >();

  let totalFiles = 0;
  let totalTokens = 0;
  let indexedGlobalTokens = 0;
  let indexedProjectTokens = 0;
  let runtimeFiles = 0;
  let runtimeTokens = 0;
  let runtimeGlobalTokens = 0;
  let runtimeProjectTokens = 0;
  let optionalFiles = 0;
  let optionalTokens = 0;
  let optionalGlobalTokens = 0;
  let optionalProjectTokens = 0;

  for (const row of rows) {
    const isGlobal = !row.project_id;
    const fileType = row.file_type;
    const ingestionMode = resolveIngestionMode({
      provider,
      fileType,
      fileName: row.file_name,
    });
    const isRuntime = ingestionMode === "always";

    if (!sectionMap.has(fileType)) {
      sectionMap.set(fileType, {
        type: fileType,
        label: FILE_TYPE_LABELS[fileType] ?? fileType,
        files: [],
        totalTokens: 0,
        runtimeTokens: 0,
        runtimeFiles: 0,
        optionalTokens: 0,
        optionalFiles: 0,
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
      ingestionMode,
    });
    section.totalTokens += row.token_count;
    if (isRuntime) {
      section.runtimeTokens += row.token_count;
      section.runtimeFiles += 1;
    } else {
      section.optionalTokens += row.token_count;
      section.optionalFiles += 1;
    }

    totalFiles++;
    totalTokens += row.token_count;
    if (isGlobal) {
      indexedGlobalTokens += row.token_count;
    } else {
      indexedProjectTokens += row.token_count;
    }
    if (isRuntime) {
      runtimeFiles += 1;
      runtimeTokens += row.token_count;
      if (isGlobal) {
        runtimeGlobalTokens += row.token_count;
      } else {
        runtimeProjectTokens += row.token_count;
      }
    } else {
      optionalFiles += 1;
      optionalTokens += row.token_count;
      if (isGlobal) {
        optionalGlobalTokens += row.token_count;
      } else {
        optionalProjectTokens += row.token_count;
      }
    }
  }

  const runtimeBase = getRuntimeBaseEstimate(provider);
  const runtimeBaseTokens =
    runtimeBase.systemPromptTokens + runtimeBase.systemToolsTokens;
  const runtimeEstimatedTokens = runtimeTokens + runtimeBaseTokens;

  // Sort sections by file type order
  const sections = Array.from(sectionMap.values()).sort((a, b) => {
    const orderA = FILE_TYPE_ORDER[a.type] ?? 99;
    const orderB = FILE_TYPE_ORDER[b.type] ?? 99;
    return orderA - orderB;
  });

  return NextResponse.json({
    sections,
    provider,
    totals: {
      totalFiles,
      totalTokens,
      runtimeFiles,
      runtimeTokens,
      runtimeEstimatedTokens,
      runtimeBaseTokens,
      runtimeSystemPromptTokens: runtimeBase.systemPromptTokens,
      runtimeSystemToolsTokens: runtimeBase.systemToolsTokens,
      runtimeBaseSource: runtimeBase.source,
      optionalFiles,
      optionalTokens,
      optionalGlobalTokens,
      optionalProjectTokens,
      indexedGlobalTokens,
      indexedProjectTokens,
      runtimeGlobalTokens,
      runtimeProjectTokens,
      // Backward-compatible aliases used by existing UI card labels.
      globalTokens: runtimeGlobalTokens,
      projectTokens: runtimeProjectTokens,
    },
  });
}
