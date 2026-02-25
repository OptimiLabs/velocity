import { getDb } from "./index";
import type {
  RoutingGraphNode,
  RoutingGraphEdge,
  RoutingGraph,
} from "@/types/routing-graph";
import type { ConfigProvider } from "@/types/provider";

// ---------------------------------------------------------------------------
// Row types (snake_case from DB → camelCase in TS)
// ---------------------------------------------------------------------------

interface NodeRow {
  id: string;
  absolute_path: string;
  label: string;
  node_type: string;
  project_root: string | null;
  exists_on_disk: number;
  position_x: number | null;
  position_y: number | null;
  file_size: number | null;
  last_modified: string | null;
  scanned_at: string;
  provider: string | null;
}

interface EdgeRow {
  id: string;
  source: string;
  target: string;
  context: string;
  reference_type: string;
  is_manual: number;
  scanned_at: string;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function rowToNode(row: NodeRow): RoutingGraphNode {
  return {
    id: row.id,
    absolutePath: row.absolute_path,
    label: row.label,
    nodeType: row.node_type as RoutingGraphNode["nodeType"],
    projectRoot: row.project_root,
    exists: row.exists_on_disk === 1,
    position:
      row.position_x != null && row.position_y != null
        ? { x: row.position_x, y: row.position_y }
        : null,
    fileSize: row.file_size,
    lastModified: row.last_modified,
    provider: (row.provider as RoutingGraphNode["provider"]) ?? "claude",
  };
}

function rowToEdge(row: EdgeRow): RoutingGraphEdge {
  return {
    id: row.id,
    source: row.source,
    target: row.target,
    context: row.context,
    referenceType: row.reference_type as RoutingGraphEdge["referenceType"],
    isManual: row.is_manual === 1,
  };
}

// ---------------------------------------------------------------------------
// Write operations (called by scanner)
// ---------------------------------------------------------------------------

export function upsertNodes(
  nodes: RoutingGraphNode[],
  scannedAt: string,
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO routing_nodes (id, absolute_path, label, node_type, project_root, exists_on_disk, position_x, position_y, file_size, last_modified, scanned_at, provider)
    VALUES (@id, @absolutePath, @label, @nodeType, @projectRoot, @exists,
      COALESCE((SELECT position_x FROM routing_nodes WHERE id = @id), @posX),
      COALESCE((SELECT position_y FROM routing_nodes WHERE id = @id), @posY),
      @fileSize, @lastModified, @scannedAt, @provider)
    ON CONFLICT(id) DO UPDATE SET
      absolute_path = @absolutePath,
      label = @label,
      node_type = @nodeType,
      project_root = @projectRoot,
      exists_on_disk = @exists,
      position_x = COALESCE(routing_nodes.position_x, @posX),
      position_y = COALESCE(routing_nodes.position_y, @posY),
      file_size = @fileSize,
      last_modified = @lastModified,
      scanned_at = @scannedAt,
      provider = @provider
  `);

  const tx = db.transaction(() => {
    for (const node of nodes) {
      stmt.run({
        id: node.id,
        absolutePath: node.absolutePath,
        label: node.label,
        nodeType: node.nodeType,
        projectRoot: node.projectRoot,
        exists: node.exists ? 1 : 0,
        posX: node.position?.x ?? null,
        posY: node.position?.y ?? null,
        fileSize: node.fileSize,
        lastModified: node.lastModified,
        scannedAt,
        provider: node.provider ?? "claude",
      });
    }
  });
  tx();
}

export function upsertEdges(
  edges: RoutingGraphEdge[],
  scannedAt: string,
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO routing_edges (id, source, target, context, reference_type, is_manual, scanned_at)
    VALUES (@id, @source, @target, @context, @referenceType, @isManual, @scannedAt)
    ON CONFLICT(id) DO UPDATE SET
      context = @context,
      reference_type = @referenceType,
      is_manual = @isManual,
      scanned_at = @scannedAt
  `);

  const tx = db.transaction(() => {
    for (const edge of edges) {
      stmt.run({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        context: edge.context,
        referenceType: edge.referenceType,
        isManual: edge.isManual ? 1 : 0,
        scannedAt,
      });
    }
  });
  tx();
}

export function clearStaleEntries(scannedAt: string): void {
  const db = getDb();
  // Delete non-manual edges from previous scans
  db.prepare(
    "DELETE FROM routing_edges WHERE scanned_at != ? AND is_manual = 0",
  ).run(scannedAt);
  // Delete nodes that weren't seen this scan AND have no manual edges
  db.prepare(
    `
    DELETE FROM routing_nodes
    WHERE scanned_at != ?
      AND id NOT IN (SELECT source FROM routing_edges WHERE is_manual = 1)
      AND id NOT IN (SELECT target FROM routing_edges WHERE is_manual = 1)
  `,
  ).run(scannedAt);
}

export function setScanMetadata(
  lastScannedAt: string,
  scanDurationMs: number,
): void {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO index_metadata (key, value) VALUES (?, ?)",
  );
  stmt.run("routing_last_scanned_at", lastScannedAt);
  stmt.run("routing_scan_duration_ms", String(scanDurationMs));
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/** Migrate old node types to new classification (runs once). */
let _nodeTypesMigrated = false;
function migrateNodeTypes(): void {
  if (_nodeTypesMigrated) return;
  _nodeTypesMigrated = true;
  const db = getDb();
  db.prepare(
    "UPDATE routing_nodes SET node_type = 'knowledge' WHERE node_type IN ('referenced-md', 'claude-dir')",
  ).run();
}

export function getAllNodes(provider?: ConfigProvider): RoutingGraphNode[] {
  migrateNodeTypes();
  const db = getDb();
  if (provider) {
    const rows = db.prepare("SELECT * FROM routing_nodes WHERE provider = ?").all(provider) as NodeRow[];
    return rows.map(rowToNode);
  }
  const rows = db.prepare("SELECT * FROM routing_nodes").all() as NodeRow[];
  return rows.map(rowToNode);
}

export function getAllEdges(nodeIds?: Set<string>): RoutingGraphEdge[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM routing_edges").all() as EdgeRow[];
  if (nodeIds) {
    return rows.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)).map(rowToEdge);
  }
  return rows.map(rowToEdge);
}

export function getScanMetadata(): {
  lastScannedAt: string | null;
  scanDurationMs: number;
} {
  const db = getDb();
  const get = (key: string) => {
    const row = db
      .prepare("SELECT value FROM index_metadata WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  };
  return {
    lastScannedAt: get("routing_last_scanned_at"),
    scanDurationMs: parseInt(get("routing_scan_duration_ms") ?? "0", 10),
  };
}

export function getEntrypoints(provider?: ConfigProvider): {
  id: string;
  label: string;
  projectRoot: string | null;
  provider: ConfigProvider;
}[] {
  const db = getDb();
  let query = "SELECT id, label, project_root, provider FROM routing_nodes WHERE node_type = 'claude-md'";
  const params: string[] = [];
  if (provider) {
    query += " AND provider = ?";
    params.push(provider);
  }
  query += " ORDER BY project_root IS NULL DESC, project_root, label, provider";
  const rows = db
    .prepare(query)
    .all(...params) as {
      id: string;
      label: string;
      project_root: string | null;
      provider: string | null;
    }[];
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    projectRoot: r.project_root,
    provider: (r.provider as ConfigProvider | null) ?? "claude",
  }));
}

// ---------------------------------------------------------------------------
// BFS traversal for entrypoint-scoped graph
// ---------------------------------------------------------------------------

export function getGraphForEntrypoint(entrypointId: string): {
  nodes: RoutingGraphNode[];
  edges: RoutingGraphEdge[];
} {
  const db = getDb();

  // Check if the entrypoint belongs to a project
  const entrypointRow = db
    .prepare("SELECT project_root FROM routing_nodes WHERE id = ?")
    .get(entrypointId) as { project_root: string | null } | undefined;

  // Project entrypoint → project files + global files
  if (entrypointRow?.project_root) {
    return getGraphForProject(entrypointRow.project_root);
  }

  // Global entrypoint → only global nodes (no project files)
  return getGlobalGraph();
}

/**
 * Get nodes and edges belonging to a specific project, including
 * global nodes (project_root IS NULL) since Claude always injects
 * ~/CLAUDE.md and ~/.claude/ globals into every session.
 */
export function getGraphForProject(projectRoot: string): {
  nodes: RoutingGraphNode[];
  edges: RoutingGraphEdge[];
} {
  migrateNodeTypes();
  const db = getDb();

  const nodeRows = db
    .prepare(
      "SELECT * FROM routing_nodes WHERE project_root = ? OR project_root IS NULL",
    )
    .all(projectRoot) as NodeRow[];

  const nodes = nodeRows.map(rowToNode);
  const nodeIds = new Set(nodes.map((n) => n.id));

  const allEdgeRows = db
    .prepare("SELECT * FROM routing_edges")
    .all() as EdgeRow[];

  const edges = allEdgeRows
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map(rowToEdge);

  return { nodes, edges };
}

/**
 * Get only global nodes (project_root IS NULL) — ~/CLAUDE.md,
 * ~/.claude/ directory, global skills, agents, routing files.
 */
function getGlobalGraph(): {
  nodes: RoutingGraphNode[];
  edges: RoutingGraphEdge[];
} {
  migrateNodeTypes();
  const db = getDb();

  const nodeRows = db
    .prepare("SELECT * FROM routing_nodes WHERE project_root IS NULL")
    .all() as NodeRow[];

  const nodes = nodeRows.map(rowToNode);
  const nodeIds = new Set(nodes.map((n) => n.id));

  const allEdgeRows = db
    .prepare("SELECT * FROM routing_edges")
    .all() as EdgeRow[];

  const edges = allEdgeRows
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map(rowToEdge);

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Position persistence
// ---------------------------------------------------------------------------

export function updateNodePosition(nodeId: string, x: number, y: number): void {
  const db = getDb();
  db.prepare(
    "UPDATE routing_nodes SET position_x = ?, position_y = ? WHERE id = ?",
  ).run(x, y, nodeId);
}

// ---------------------------------------------------------------------------
// Manual edge operations
// ---------------------------------------------------------------------------

export function addManualEdge(
  source: string,
  target: string,
  context: string,
): RoutingGraphEdge {
  const db = getDb();
  const id = `${source}→${target}`;
  const scannedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT OR REPLACE INTO routing_edges (id, source, target, context, reference_type, is_manual, scanned_at)
    VALUES (?, ?, ?, ?, 'manual', 1, ?)
  `,
  ).run(id, source, target, context, scannedAt);

  return {
    id,
    source,
    target,
    context,
    referenceType: "manual",
    isManual: true,
  };
}

export function removeManualEdge(source: string, target: string): void {
  const db = getDb();
  db.prepare(
    "DELETE FROM routing_edges WHERE source = ? AND target = ? AND is_manual = 1",
  ).run(source, target);
}

export function deleteNode(nodeId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM routing_edges WHERE source = ? OR target = ?").run(nodeId, nodeId);
  db.prepare("DELETE FROM routing_nodes WHERE id = ?").run(nodeId);
}

// ---------------------------------------------------------------------------
// Full graph read (for "all" scope)
// ---------------------------------------------------------------------------

export function readFullGraph(provider?: ConfigProvider): RoutingGraph {
  const meta = getScanMetadata();
  const nodes = getAllNodes(provider);
  const nodeIds = provider ? new Set(nodes.map((n) => n.id)) : undefined;
  return {
    version: 1,
    lastScannedAt: meta.lastScannedAt ?? "",
    scanDurationMs: meta.scanDurationMs,
    totalTokensUsed: 0,
    nodes,
    edges: getAllEdges(nodeIds),
  };
}

export function readScopedGraph(entrypointId: string, provider?: ConfigProvider): RoutingGraph {
  const meta = getScanMetadata();
  const { nodes: rawNodes, edges: rawEdges } = getGraphForEntrypoint(entrypointId);
  // If provider specified, filter to only that provider's nodes
  const nodes = provider ? rawNodes.filter((n) => n.provider === provider) : rawNodes;
  const nodeIds = provider ? new Set(nodes.map((n) => n.id)) : undefined;
  const edges = nodeIds ? rawEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)) : rawEdges;
  return {
    version: 1,
    lastScannedAt: meta.lastScannedAt ?? "",
    scanDurationMs: meta.scanDurationMs,
    totalTokensUsed: 0,
    nodes,
    edges,
  };
}
