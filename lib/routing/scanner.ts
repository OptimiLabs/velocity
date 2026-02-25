import fs from "fs";
import path from "path";
import os from "os";
import type {
  RoutingGraph,
  RoutingGraphNode,
  RoutingGraphEdge,
  ScanProgressEvent,
} from "@/types/routing-graph";
import type { ConfigProvider } from "@/types/provider";
import { parseFileReferences } from "./ai-parser";
import { getDb } from "@/lib/db";
import {
  upsertNodes,
  upsertEdges,
  setScanMetadata,
  readFullGraph,
} from "@/lib/db/routing-graph";
import { CODEX_AGENTS_HOME, CODEX_HOME } from "@/lib/codex/paths";
import {
  readGeminiConfigFrom,
  resolveGeminiContextFileName,
} from "@/lib/gemini/config";
import { GEMINI_CONFIG, GEMINI_HOME, projectGeminiConfig } from "@/lib/gemini/paths";

export type RoutingScanProvider = ConfigProvider | "all";

/**
 * Batch-load file content from the instruction_files DB table.
 * Avoids redundant filesystem reads for files the indexer already cached.
 */
function loadContentFromDb(filePaths: string[]): Map<string, string> {
  const db = getDb();
  const contentMap = new Map<string, string>();
  for (let i = 0; i < filePaths.length; i += 500) {
    const chunk = filePaths.slice(i, i + 500);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT file_path, content FROM instruction_files WHERE file_path IN (${placeholders})`,
      )
      .all(...chunk) as { file_path: string; content: string }[];
    for (const row of rows) {
      if (row.content) contentMap.set(row.file_path, row.content);
    }
  }
  return contentMap;
}

function getScopedMetadataKey(
  provider: RoutingScanProvider,
  key: "last_scanned_at" | "scan_duration_ms",
): string {
  if (provider === "all") {
    return key === "last_scanned_at"
      ? "routing_last_scanned_at"
      : "routing_scan_duration_ms";
  }
  return key === "last_scanned_at"
    ? `routing_last_scanned_at:${provider}`
    : `routing_scan_duration_ms:${provider}`;
}

/** Get the timestamp of the last completed routing scan for a provider scope. */
function getLastScanTime(provider: RoutingScanProvider): string | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT value FROM index_metadata WHERE key = ?",
    )
    .get(getScopedMetadataKey(provider, "last_scanned_at")) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setScopedScanMetadata(
  provider: RoutingScanProvider,
  lastScannedAt: string,
  scanDurationMs: number,
): void {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO index_metadata (key, value) VALUES (?, ?)",
  );
  stmt.run(getScopedMetadataKey(provider, "last_scanned_at"), lastScannedAt);
  stmt.run(getScopedMetadataKey(provider, "scan_duration_ms"), String(scanDurationMs));
}

/** Determine which files have changed since the last scan via mtime from instruction_files. */
function getChangedFiles(
  filePaths: string[],
  since: string | null,
): Set<string> {
  if (!since) return new Set(filePaths); // first scan — all files changed
  const sinceMs = new Date(since).getTime();
  const changed = new Set<string>();

  // Use last_indexed_at from instruction_files as the change indicator
  const db = getDb();
  for (let i = 0; i < filePaths.length; i += 500) {
    const chunk = filePaths.slice(i, i + 500);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT file_path, last_indexed_at FROM instruction_files WHERE file_path IN (${placeholders})`,
      )
      .all(...chunk) as { file_path: string; last_indexed_at: string | null }[];
    for (const row of rows) {
      if (
        !row.last_indexed_at ||
        new Date(row.last_indexed_at).getTime() > sinceMs
      ) {
        changed.add(row.file_path);
      }
    }
  }
  return changed;
}

/**
 * Incremental stale-entry cleanup: only remove edges from re-scanned sources
 * and from files that disappeared since the last scan. Unchanged files' edges
 * are left untouched (they keep their old scanned_at timestamp).
 */
function clearStaleEntriesIncremental(
  changedFiles: Set<string>,
  scannedAt: string,
  provider: RoutingScanProvider,
): void {
  const db = getDb();

  // 1. For CHANGED files: delete old reference edges that weren't refreshed
  const stmtClean = db.prepare(
    "DELETE FROM routing_edges WHERE source = ? AND is_manual = 0 AND scanned_at != ?",
  );
  for (const fp of changedFiles) {
    stmtClean.run(fp, scannedAt);
  }

  if (provider === "all") {
    // 2. For DISAPPEARED files: their nodes have old scanned_at → clean their edges
    db.prepare(
      `DELETE FROM routing_edges
       WHERE is_manual = 0
       AND source IN (SELECT id FROM routing_nodes WHERE scanned_at != ?)`,
    ).run(scannedAt);

    // 3. Prune orphan nodes from previous scans (no manual edges referencing them)
    db.prepare(
      `DELETE FROM routing_nodes
       WHERE scanned_at != ?
         AND id NOT IN (SELECT source FROM routing_edges WHERE is_manual = 1)
         AND id NOT IN (SELECT target FROM routing_edges WHERE is_manual = 1)`,
    ).run(scannedAt);
    return;
  }

  // 2. For DISAPPEARED files in this provider scope, clean their edges
  db.prepare(
    `DELETE FROM routing_edges
     WHERE is_manual = 0
     AND source IN (
       SELECT id FROM routing_nodes
       WHERE provider = ? AND scanned_at != ?
     )`,
  ).run(provider, scannedAt);

  // 3. Prune stale nodes only for this provider (preserve other providers)
  db.prepare(
    `DELETE FROM routing_nodes
     WHERE provider = ?
       AND scanned_at != ?
       AND id NOT IN (SELECT source FROM routing_edges WHERE is_manual = 1)
       AND id NOT IN (SELECT target FROM routing_edges WHERE is_manual = 1)`,
  ).run(provider, scannedAt);
}

const HOME = os.homedir();

type GeminiEntrypointOptions = {
  projectPath?: string | null;
  geminiContextFileName?: string | null;
};

type GeminiContextCacheEntry = {
  value: string;
  mtimeMs: number | null;
};

const geminiContextFileNameCache = new Map<string, GeminiContextCacheEntry>();

function readSettingsMtimeMs(settingsPath: string): number | null {
  try {
    return fs.statSync(settingsPath).mtimeMs;
  } catch {
    return null;
  }
}

function resolveGeminiEntrypointFileName(
  options?: GeminiEntrypointOptions,
): string {
  const override = options?.geminiContextFileName?.trim();
  if (override) return override;

  const cacheKey = options?.projectPath
    ? `project:${options.projectPath}`
    : "global";
  const settingsPath = options?.projectPath
    ? projectGeminiConfig(options.projectPath)
    : GEMINI_CONFIG;
  const settingsMtimeMs = readSettingsMtimeMs(settingsPath);
  const cached = geminiContextFileNameCache.get(cacheKey);
  if (cached && cached.mtimeMs === settingsMtimeMs) return cached.value;

  const resolved = resolveGeminiContextFileName(readGeminiConfigFrom(settingsPath));
  geminiContextFileNameCache.set(cacheKey, {
    value: resolved,
    mtimeMs: settingsMtimeMs,
  });
  return resolved;
}

function isGeminiEntrypointFile(
  filePath: string,
  options?: GeminiEntrypointOptions,
): boolean {
  const fileBase = path.basename(filePath);
  const configuredName = resolveGeminiEntrypointFileName(options);
  const configuredBase = path.basename(configuredName);

  if (fileBase === configuredBase) return true;
  if (fileBase === "GEMINI.md") return true; // Backward compatibility.

  const normalizedConfig = configuredName.replace(/\\/g, "/");
  if (!normalizedConfig.includes("/")) return false;

  const baseDir = options?.projectPath || GEMINI_HOME;
  const expectedPath = path.resolve(baseDir, configuredName);
  return path.resolve(filePath) === expectedPath;
}

export function inferRoutingProvider(
  filePath: string,
  dbFileType?: string,
  options?: GeminiEntrypointOptions,
): ConfigProvider | null {
  const base = path.basename(filePath);

  // Provider entrypoint files are the strongest signal.
  if (base === "AGENTS.md" || base === "AGENTS.override.md") return "codex";
  if (base === "CLAUDE.md") return "claude";
  if (isGeminiEntrypointFile(filePath, options)) return "gemini";

  // Provider home + project directories.
  if (filePath.startsWith(`${CODEX_HOME}${path.sep}`) || filePath.includes(`${path.sep}.codex${path.sep}`)) {
    return "codex";
  }
  if (
    filePath.startsWith(`${CODEX_AGENTS_HOME}${path.sep}`) ||
    filePath.includes(`${path.sep}.agents${path.sep}`)
  ) {
    return "codex";
  }
  if (filePath.startsWith(`${GEMINI_HOME}${path.sep}`) || filePath.includes(`${path.sep}.gemini${path.sep}`)) {
    return "gemini";
  }
  if (
    filePath.includes(`${path.sep}.claude${path.sep}`) ||
    filePath.includes(`${path.sep}.claude.local${path.sep}`) ||
    filePath.startsWith(path.join(HOME, ".claude") + path.sep)
  ) {
    return "claude";
  }

  // DB file_type can identify some provider-scoped files only when combined with path.
  if (dbFileType === "agents.md" && base === "agents.md") return "claude";

  return null;
}

function resolveNodeProvider(params: {
  filePath: string;
  dbFileType?: string;
  projectPath?: string | null;
  sourceProvider?: ConfigProvider;
  scanProvider: RoutingScanProvider;
}): ConfigProvider {
  const inferred = inferRoutingProvider(params.filePath, params.dbFileType, {
    projectPath: params.projectPath,
  });
  if (inferred) return inferred;
  if (params.sourceProvider) return params.sourceProvider;
  if (params.scanProvider !== "all") return params.scanProvider;
  return "claude";
}

/**
 * Query all indexed .md files from instruction_files table.
 * This replaces the old discoverFiles() filesystem walk — the instruction
 * indexer is the single source of truth for file discovery.
 *
 * Returns provider-scoped routing source files only (entrypoint and provider
 * instruction directories). Project knowledge files are still included later
 * when referenced by those source files.
 */
function discoverFromDb(
  provider: RoutingScanProvider = "all",
): {
  files: string[];
  fileTypeMap: Map<string, string>;
  projectPathMap: Map<string, string>;
} {
  const db = getDb();
  const rows = db
    .prepare("SELECT file_path, file_type, project_path FROM instruction_files WHERE is_active = 1")
    .all() as { file_path: string; file_type: string; project_path: string | null }[];

  const files: string[] = [];
  const fileTypeMap = new Map<string, string>();
  const projectPathMap = new Map<string, string>();

  for (const row of rows) {
    const inferredProvider = inferRoutingProvider(row.file_path, row.file_type, {
      projectPath: row.project_path,
    });
    if (!inferredProvider) continue;
    if (provider !== "all" && inferredProvider !== provider) continue;

    files.push(row.file_path);
    fileTypeMap.set(row.file_path, row.file_type);
    if (row.project_path) {
      projectPathMap.set(row.file_path, row.project_path);
    }
  }

  return { files, fileTypeMap, projectPathMap };
}

function resolvePath(referencedPath: string, sourceFilePath: string): string {
  if (referencedPath.startsWith("~/") || referencedPath === "~") {
    return path.resolve(HOME, referencedPath.slice(2));
  }
  if (path.isAbsolute(referencedPath)) {
    return referencedPath;
  }
  const sourceDir = path.dirname(sourceFilePath);
  return path.resolve(sourceDir, referencedPath);
}

function findProjectRoot(filePath: string): string | null {
  let dir = path.dirname(filePath);
  while (dir !== "/" && dir !== HOME) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

export async function scanRoutingGraph(
  onProgress?: (event: ScanProgressEvent) => void,
  provider: RoutingScanProvider = "all",
): Promise<RoutingGraph> {
  const startTime = Date.now();

  // Phase 1: Discover from instruction_files (no filesystem walk)
  onProgress?.({
    type: "progress",
    phase: "discovering",
    current: 0,
    total: 0,
    currentFile: "Querying indexed files...",
  });

  const { files: discoveredFiles, fileTypeMap, projectPathMap } = discoverFromDb(provider);

  onProgress?.({
    type: "progress",
    phase: "discovering",
    current: discoveredFiles.length,
    total: discoveredFiles.length,
  });

  const nodes = new Map<string, RoutingGraphNode>();
  const edges: RoutingGraphEdge[] = [];
  const edgeIds = new Set<string>();

  function addEdge(edge: RoutingGraphEdge) {
    if (edgeIds.has(edge.id)) {
      // Allow parsed references to override structural edges (more specific)
      if (edge.referenceType !== "structural" && edge.referenceType !== "manual") {
        const idx = edges.findIndex((e) => e.id === edge.id);
        if (idx !== -1 && edges[idx].referenceType === "structural") {
          edges[idx] = edge;
        }
      }
      return;
    }
    edgeIds.add(edge.id);
    edges.push(edge);
  }

  // Create nodes for all discovered source files
  for (const filePath of discoveredFiles) {
    const dbFileType = fileTypeMap.get(filePath);
    const node = buildNode(filePath, dbFileType, projectPathMap.get(filePath));
    node.provider = resolveNodeProvider({
      filePath,
      dbFileType,
      projectPath: projectPathMap.get(filePath),
      scanProvider: provider,
    });
    nodes.set(filePath, node);
  }

  // Phase 2: Build structural edges
  onProgress?.({
    type: "progress",
    phase: "resolving",
    current: 0,
    total: discoveredFiles.length,
    currentFile: "Building hierarchy...",
  });

  // Incremental scanning: only re-parse files that changed since last scan
  const lastScan = getLastScanTime(provider);
  const changedFiles = getChangedFiles(discoveredFiles, lastScan);

  // Load content from DB where available (avoids redundant filesystem reads)
  const filesToParse = discoveredFiles.filter((f) => changedFiles.has(f));
  const dbContent = loadContentFromDb(filesToParse);

  // Phase 3: Parse CHANGED files for explicit .md references
  const skippedCount = discoveredFiles.length - changedFiles.size;
  onProgress?.({
    type: "progress",
    phase: "parsing",
    current: 0,
    total: filesToParse.length,
    currentFile:
      skippedCount > 0 ? `${skippedCount} unchanged files skipped` : undefined,
  });

  for (let i = 0; i < filesToParse.length; i++) {
    const filePath = filesToParse[i];

    onProgress?.({
      type: "progress",
      phase: "parsing",
      current: i + 1,
      total: filesToParse.length,
      currentFile: filePath,
    });

    // Prefer DB content, fall back to filesystem for un-indexed files
    let content = dbContent.get(filePath);
    if (!content) {
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }
    }

    if (!content.trim()) continue;

    const result = parseFileReferences(content, filePath);

    onProgress?.({
      type: "file-parsed",
      filePath,
      referencesFound: result.references.length,
      tokensUsed: 0,
    });

    for (const ref of result.references) {
      const resolvedPath = resolvePath(ref.referencedPath, filePath);

      // Create target node if it doesn't exist yet
      if (!nodes.has(resolvedPath)) {
        const sourceNode = nodes.get(filePath);
        const sourceProvider = sourceNode?.provider;
        const targetNode = buildNode(
          resolvedPath,
          fileTypeMap.get(resolvedPath),
          projectPathMap.get(resolvedPath),
        );
        targetNode.provider = resolveNodeProvider({
          filePath: resolvedPath,
          dbFileType: fileTypeMap.get(resolvedPath),
          projectPath: projectPathMap.get(resolvedPath) ?? sourceNode?.projectRoot,
          sourceProvider,
          scanProvider: provider,
        });
        nodes.set(resolvedPath, targetNode);
      }

      addEdge({
        id: `${filePath}→${resolvedPath}`,
        source: filePath,
        target: resolvedPath,
        context: ref.context,
        referenceType: ref.referenceType,
        isManual: false,
      });
    }
  }

  // Phase 4: Build graph
  onProgress?.({
    type: "progress",
    phase: "building",
    current: 0,
    total: 1,
  });

  const scannedAt = new Date().toISOString();
  const scanDurationMs = Date.now() - startTime;

  // Persist this scan's discoveries to DB
  const scannedNodes = Array.from(nodes.values());
  upsertNodes(scannedNodes, scannedAt);
  upsertEdges(edges, scannedAt);
  clearStaleEntriesIncremental(changedFiles, scannedAt, provider);
  setScopedScanMetadata(provider, scannedAt, scanDurationMs);
  setScanMetadata(scannedAt, scanDurationMs);

  // Reload from DB so totals include edges from prior scans in the same scope.
  const graph = readFullGraph(provider === "all" ? undefined : provider);

  onProgress?.({ type: "complete", graph });

  return graph;
}

export function classifyNodeType(
  filePath: string,
  dbFileType?: string,
  options?: GeminiEntrypointOptions,
): RoutingGraphNode["nodeType"] {
  // If we have a DB file_type, map it to nodeType
  if (dbFileType) {
    switch (dbFileType) {
      case "CLAUDE.md":
        return "claude-md";
      case "skill.md":
        return "skill";
      case "agents.md":
        return path.basename(filePath) === "agents.md" ? "agent" : "claude-md";
      default:
        return "knowledge";
    }
  }

  // Fallback heuristic for files discovered via references (not in instruction_files)
  const fileName = path.basename(filePath);
  if (
    fileName === "CLAUDE.md" ||
    fileName === "AGENTS.md" ||
    fileName === "AGENTS.override.md" ||
    isGeminiEntrypointFile(filePath, options)
  ) {
    return "claude-md";
  }
  if (
    filePath.includes("/commands/") ||
    filePath.includes("/skills/") ||
    fileName === "SKILL.md"
  )
    return "skill";
  if (filePath.includes("/agents/") || fileName === "agents.md") return "agent";
  return "knowledge";
}

function buildNode(
  filePath: string,
  dbFileType?: string,
  dbProjectPath?: string | null,
): RoutingGraphNode {
  const exists = fs.existsSync(filePath);
  const projectRoot = dbProjectPath || findProjectRoot(filePath);
  let fileSize: number | null = null;
  let lastModified: string | null = null;

  if (exists) {
    try {
      const stat = fs.statSync(filePath);
      fileSize = stat.size;
      lastModified = stat.mtime.toISOString();
    } catch {
      // ignore
    }
  }

  return {
    id: filePath,
    absolutePath: filePath,
    label: path.basename(filePath),
    nodeType: classifyNodeType(filePath, dbFileType, { projectPath: projectRoot }),
    projectRoot,
    exists,
    position: null,
    fileSize,
    lastModified,
    provider: undefined,
  };
}
