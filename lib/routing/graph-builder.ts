import os from "os";
import path from "path";
import { MarkerType, type Node, type Edge } from "@xyflow/react";
import type { RoutingGraph, RoutingGraphNode, RoutingGraphEdge } from "@/types/routing-graph";
import type { ConfigProvider } from "@/types/provider";
import { getLayoutedElements } from "@/lib/graph/layout";
import { getSessionProvider } from "@/lib/providers/session-registry";
import { ROUTING_EDGE_ALL_TYPES } from "@/stores/routingStore";
import type {
  LayoutMode,
  RoutingEdgeType,
  RoutingNodeType,
} from "@/stores/routingStore";

const PROJECT_COLORS = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#7c3aed", // violet
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f59e0b", // amber
  "#2563eb", // blue
];

function shortenPath(absPath: string): string {
  const match = absPath.match(/^\/Users\/[^/]+\/(.*)$/);
  if (match) return "~/" + match[1];
  const match2 = absPath.match(/^\/home\/[^/]+\/(.*)$/);
  if (match2) return "~/" + match2[1];
  return absPath;
}

interface BuildOptions {
  layoutMode?: LayoutMode;
  visibleNodeTypes?: Set<RoutingNodeType>;
  visibleEdgeTypes?: Set<RoutingEdgeType>;
  collapsedFolders?: Set<string>;
  provider?: ConfigProvider | "all";
}

function getEdgeType(edge: RoutingGraphEdge): RoutingEdgeType {
  if (edge.isManual || edge.referenceType === "manual") {
    return "manual";
  }
  if (
    edge.source.startsWith("entrypoint::") ||
    edge.target.startsWith("entrypoint::")
  ) {
    return "entrypoint";
  }
  if (edge.referenceType === "table-entry") {
    return "table-entry";
  }
  if (edge.referenceType === "structural") {
    return "contains";
  }
  return "reference";
}

export function buildXYFlowGraph(
  graph: RoutingGraph,
  options?: BuildOptions,
): {
  nodes: Node[];
  edges: Edge[];
} {
  const {
    layoutMode = "dagre",
    visibleNodeTypes = new Set<RoutingNodeType>(["claude-md", "skill", "agent", "knowledge", "folder"]),
    visibleEdgeTypes = new Set<RoutingEdgeType>(ROUTING_EDGE_ALL_TYPES),
    collapsedFolders = new Set<string>(),
    provider = "claude",
  } = options ?? {};

  // --- Filter nodes ---
  let filteredNodes = graph.nodes.filter((n) => {
    return visibleNodeTypes.has(n.nodeType);
  });

  let filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

  let filteredEdges = graph.edges.filter(
    (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target),
  );

  // --- Clone global nodes into each project cluster ---
  // When multiple projects exist, a single ~/CLAUDE.md hub creates an ugly
  // star pattern. Instead, give each project its own copy of the global nodes.
  {
    const globalNodes = filteredNodes.filter((n) => !n.projectRoot);
    const projectNodes = filteredNodes.filter((n) => !!n.projectRoot);
    const projectRootsSet = new Set(projectNodes.map((n) => n.projectRoot!));

    // Only clone when there are 2+ projects (no star pattern with 0-1)
    if (globalNodes.length > 0 && projectRootsSet.size >= 2) {
      const globalNodeIds = new Set(globalNodes.map((n) => n.id));

      // Edges within global nodes (e.g. ~/CLAUDE.md → ~/.claude/CLAUDE.md)
      const intraGlobalEdges = filteredEdges.filter(
        (e) => globalNodeIds.has(e.source) && globalNodeIds.has(e.target),
      );

      // Edges from global nodes to project nodes
      const globalToProjectEdges = filteredEdges.filter(
        (e) => globalNodeIds.has(e.source) && !globalNodeIds.has(e.target),
      );

      // Edges not involving any global node (keep as-is)
      const nonGlobalEdges = filteredEdges.filter(
        (e) => !globalNodeIds.has(e.source) && !globalNodeIds.has(e.target),
      );

      // For each project, find which global nodes are relevant via BFS
      const clonedNodes: RoutingGraphNode[] = [];
      const clonedEdges: RoutingGraphEdge[] = [];

      for (const projectRoot of projectRootsSet) {
        const suffix = `::proj::${projectRoot}`;

        // Find global nodes directly connected to this project's nodes
        const thisProjectNodeIds = new Set(
          projectNodes.filter((n) => n.projectRoot === projectRoot).map((n) => n.id),
        );
        const relevantGlobalIds = new Set<string>();
        for (const edge of globalToProjectEdges) {
          if (thisProjectNodeIds.has(edge.target)) {
            relevantGlobalIds.add(edge.source);
          }
        }

        // BFS backwards through intra-global edges to find ancestor globals
        const queue = [...relevantGlobalIds];
        while (queue.length > 0) {
          const current = queue.shift()!;
          for (const edge of intraGlobalEdges) {
            if (edge.target === current && !relevantGlobalIds.has(edge.source)) {
              relevantGlobalIds.add(edge.source);
              queue.push(edge.source);
            }
          }
        }

        // Clone each relevant global node for this project
        for (const globalId of relevantGlobalIds) {
          const original = globalNodes.find((n) => n.id === globalId)!;
          clonedNodes.push({
            ...original,
            id: `${globalId}${suffix}`,
            projectRoot: projectRoot,
          });
        }

        // Clone intra-global edges between relevant globals
        for (const edge of intraGlobalEdges) {
          if (relevantGlobalIds.has(edge.source) && relevantGlobalIds.has(edge.target)) {
            clonedEdges.push({
              ...edge,
              id: `${edge.id}${suffix}`,
              source: `${edge.source}${suffix}`,
              target: `${edge.target}${suffix}`,
            });
          }
        }

        // Remap global→project edges to clone→project
        for (const edge of globalToProjectEdges) {
          if (thisProjectNodeIds.has(edge.target) && relevantGlobalIds.has(edge.source)) {
            clonedEdges.push({
              ...edge,
              id: `${edge.id}${suffix}`,
              source: `${edge.source}${suffix}`,
            });
          }
        }
      }

      // Replace filtered data: remove originals, add clones
      filteredNodes = [...projectNodes, ...clonedNodes];
      filteredEdges = [...nonGlobalEdges, ...clonedEdges];
      filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
    }
  }

  // --- Derive folder nodes from file paths ---
  if (visibleNodeTypes.has("folder")) {
    // Group file nodes by their immediate parent directory
    const dirChildren = new Map<string, string[]>(); // dirPath → child node IDs
    const dirProjects = new Map<string, string | null>(); // dirPath → projectRoot

    for (const node of filteredNodes) {
      if (node.nodeType === "folder") continue; // skip if somehow present
      const lastSlash = node.absolutePath.lastIndexOf("/");
      if (lastSlash <= 0) continue;
      const dirPath = node.absolutePath.substring(0, lastSlash);

      if (!dirChildren.has(dirPath)) dirChildren.set(dirPath, []);
      dirChildren.get(dirPath)!.push(node.id);

      // Inherit projectRoot from children (first wins — all children in same dir share project)
      if (!dirProjects.has(dirPath)) {
        dirProjects.set(dirPath, node.projectRoot);
      }
    }

    // Fill in ancestor folders to create complete chains
    // Walk up from each known dir to create intermediate ancestors that have
    // no direct file children (e.g. ~/.claude/knowledge/ which only has subdirs)
    const homeDir = os.homedir();
    const claudeDir = path.join(homeDir, ".claude");
    const allDirPaths = new Set(dirChildren.keys());

    // Collect project roots as stop boundaries
    const projectRootBoundaries = new Set<string>();
    for (const node of filteredNodes) {
      if (node.projectRoot) projectRootBoundaries.add(node.projectRoot);
    }

    for (const dir of [...allDirPaths]) {
      let current = dir;
      while (true) {
        const parentLastSlash = current.lastIndexOf("/");
        if (parentLastSlash <= 0) break;
        const parent = current.substring(0, parentLastSlash);

        // Stop if we already have this dir
        if (allDirPaths.has(parent)) break;

        // Don't go above home dir or ~/.claude
        if (parent.length < claudeDir.length && !parent.startsWith(claudeDir)) {
          // For non-claude paths, don't go above project roots
          if (projectRootBoundaries.has(parent) || parent.length < homeDir.length) break;
        }

        // Add ancestor as empty-child dir
        allDirPaths.add(parent);
        if (!dirChildren.has(parent)) dirChildren.set(parent, []);
        if (!dirProjects.has(parent)) {
          dirProjects.set(parent, dirProjects.get(current) ?? null);
        }

        current = parent;
      }
    }

    // Detect parent→child folder relationships (rebuilt after adding ancestors)
    const dirPaths = Array.from(dirChildren.keys()).sort();
    const childFolders = new Map<string, string[]>(); // parent folder ID → child folder IDs

    for (const dir of dirPaths) {
      const parentLastSlash = dir.lastIndexOf("/");
      if (parentLastSlash <= 0) continue;
      const parentDir = dir.substring(0, parentLastSlash);
      if (dirChildren.has(parentDir)) {
        const parentFolderId = `folder::${parentDir}`;
        const childFolderId = `folder::${dir}`;
        if (!childFolders.has(parentFolderId)) childFolders.set(parentFolderId, []);
        childFolders.get(parentFolderId)!.push(childFolderId);
      }
    }

    // Create folder nodes and containment edges
    const folderNodes: RoutingGraphNode[] = [];
    const containmentEdges: RoutingGraphEdge[] = [];

    for (const [dirPath, children] of dirChildren) {
      const folderId = `folder::${dirPath}`;
      const dirName = dirPath.substring(dirPath.lastIndexOf("/") + 1);
      const subFolderCount = childFolders.get(folderId)?.length ?? 0;

      folderNodes.push({
        id: folderId,
        absolutePath: dirPath,
        label: dirName,
        nodeType: "folder",
        projectRoot: dirProjects.get(dirPath) ?? null,
        exists: true,
        position: null,
        fileSize: null,
        lastModified: null,
        childCount: children.length + subFolderCount,
        isCollapsed: collapsedFolders.has(folderId),
      });

      // Folder → child file edges
      for (const childId of children) {
        containmentEdges.push({
          id: `${folderId}→${childId}`,
          source: folderId,
          target: childId,
          context: "contains",
          referenceType: "structural",
          isManual: false,
        });
      }
    }

    // Folder → child folder edges
    for (const [parentFolderId, childFolderIds] of childFolders) {
      for (const childFolderId of childFolderIds) {
        containmentEdges.push({
          id: `${parentFolderId}→${childFolderId}`,
          source: parentFolderId,
          target: childFolderId,
          context: "contains",
          referenceType: "structural",
          isManual: false,
        });
      }
    }

    // Add folders and containment edges to filtered data
    filteredNodes = [...filteredNodes, ...folderNodes];
    filteredEdges = [...filteredEdges, ...containmentEdges];

    // Apply collapse: remove descendants of collapsed folders
    if (collapsedFolders.size > 0) {
      // Build adjacency from containment edges for BFS
      const containsAdj = new Map<string, string[]>();
      for (const edge of containmentEdges) {
        if (!containsAdj.has(edge.source)) containsAdj.set(edge.source, []);
        containsAdj.get(edge.source)!.push(edge.target);
      }

      // Collect all descendant IDs of collapsed folders
      const hiddenIds = new Set<string>();
      for (const folderId of collapsedFolders) {
        const queue = containsAdj.get(folderId) ?? [];
        const visited = new Set<string>();
        for (const id of queue) {
          if (visited.has(id)) continue;
          visited.add(id);
          hiddenIds.add(id);
          const children = containsAdj.get(id) ?? [];
          for (const child of children) {
            if (!visited.has(child)) queue.push(child);
          }
        }
      }

      if (hiddenIds.size > 0) {
        filteredNodes = filteredNodes.filter((n) => !hiddenIds.has(n.id));
        filteredEdges = filteredEdges.filter(
          (e) => !hiddenIds.has(e.source) && !hiddenIds.has(e.target),
        );
      }
    }

    // Rebuild filteredNodeIds
    filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  }

  // --- Create entrypoint nodes ---
  if (visibleNodeTypes.has("entrypoint")) {
    const entrypointNodes: RoutingGraphNode[] = [];
    const entrypointEdges: RoutingGraphEdge[] = [];

    // Collect existing folder nodes and project roots from current filteredNodes
    const existingFolders = filteredNodes.filter((n) => n.nodeType === "folder");
    const existingProjectRoots = new Set<string>();
    for (const n of filteredNodes) {
      if (n.projectRoot) existingProjectRoots.add(n.projectRoot);
    }

    // Root entrypoint — label based on active provider
    const rootLabel = provider === "all"
      ? "All Providers"
      : `${getSessionProvider(provider)?.label ?? provider} Code`;

    entrypointNodes.push({
      id: "entrypoint::root",
      absolutePath: "",
      label: rootLabel,
      nodeType: "entrypoint",
      projectRoot: null,
      exists: true,
      position: null,
      fileSize: null,
      lastModified: null,
    });

    // Global entrypoint
    entrypointNodes.push({
      id: "entrypoint::global",
      absolutePath: "",
      label: "Global",
      nodeType: "entrypoint",
      projectRoot: null,
      exists: true,
      position: null,
      fileSize: null,
      lastModified: null,
    });

    // Root → Global edge
    entrypointEdges.push({
      id: "entrypoint::root→entrypoint::global",
      source: "entrypoint::root",
      target: "entrypoint::global",
      context: "scope",
      referenceType: "structural",
      isManual: false,
    });

    // Find root folder for global nodes (shallowest folder without projectRoot)
    const globalFolders = existingFolders.filter((f) => !f.projectRoot);
    if (globalFolders.length > 0) {
      const rootGlobalFolder = globalFolders.sort(
        (a, b) => a.absolutePath.length - b.absolutePath.length,
      )[0];
      entrypointEdges.push({
        id: `entrypoint::global→${rootGlobalFolder.id}`,
        source: "entrypoint::global",
        target: rootGlobalFolder.id,
        context: "contains",
        referenceType: "structural",
        isManual: false,
      });
    } else {
      // Fallback: connect to CLAUDE.md node directly
      const globalClaudeMd = filteredNodes.find(
        (n) => n.nodeType === "claude-md" && !n.projectRoot,
      );
      if (globalClaudeMd) {
        entrypointEdges.push({
          id: `entrypoint::global→${globalClaudeMd.id}`,
          source: "entrypoint::global",
          target: globalClaudeMd.id,
          context: "contains",
          referenceType: "structural",
          isManual: false,
        });
      }
    }

    // Project entrypoints
    for (const projectRoot of existingProjectRoots) {
      const projectId = `entrypoint::project::${projectRoot}`;
      const projectLabel = "Project";

      entrypointNodes.push({
        id: projectId,
        absolutePath: projectRoot,
        label: projectLabel,
        nodeType: "entrypoint",
        projectRoot,
        exists: true,
        position: null,
        fileSize: null,
        lastModified: null,
      });

      // Root → Project edge
      entrypointEdges.push({
        id: `entrypoint::root→${projectId}`,
        source: "entrypoint::root",
        target: projectId,
        context: "scope",
        referenceType: "structural",
        isManual: false,
      });

      // Find root folder for this project (shallowest folder with matching projectRoot)
      const projectFolders = existingFolders.filter(
        (f) => f.projectRoot === projectRoot,
      );
      if (projectFolders.length > 0) {
        const rootProjectFolder = projectFolders.sort(
          (a, b) => a.absolutePath.length - b.absolutePath.length,
        )[0];
        entrypointEdges.push({
          id: `${projectId}→${rootProjectFolder.id}`,
          source: projectId,
          target: rootProjectFolder.id,
          context: "contains",
          referenceType: "structural",
          isManual: false,
        });
      } else {
        // Fallback: connect to project CLAUDE.md directly
        const projectClaudeMd = filteredNodes.find(
          (n) =>
            n.nodeType === "claude-md" && n.projectRoot === projectRoot,
        );
        if (projectClaudeMd) {
          entrypointEdges.push({
            id: `${projectId}→${projectClaudeMd.id}`,
            source: projectId,
            target: projectClaudeMd.id,
            context: "contains",
            referenceType: "structural",
            isManual: false,
          });
        }
      }
    }

    filteredNodes = [...filteredNodes, ...entrypointNodes];
    filteredEdges = [...filteredEdges, ...entrypointEdges];
    filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  }

  // Apply edge type filters from the toolbar/store.
  filteredEdges = filteredEdges.filter((edge) =>
    visibleEdgeTypes.has(getEdgeType(edge)),
  );

  // --- Common setup ---
  const xyNodes: Node[] = [];
  const xyEdges: Edge[] = [];

  // Collect project colors
  const projectRoots = new Set<string>();
  for (const node of filteredNodes) {
    if (node.projectRoot) projectRoots.add(node.projectRoot);
  }
  const projectColorMap = new Map<string, string>();
  let colorIdx = 0;
  for (const root of projectRoots) {
    projectColorMap.set(root, PROJECT_COLORS[colorIdx % PROJECT_COLORS.length]);
    colorIdx++;
  }

  // Pre-compute edge counts (from full graph for accurate stats)
  const outCountMap = new Map<string, number>();
  const inCountMap = new Map<string, number>();
  for (const edge of graph.edges) {
    outCountMap.set(edge.source, (outCountMap.get(edge.source) || 0) + 1);
    inCountMap.set(edge.target, (inCountMap.get(edge.target) || 0) + 1);
  }

  /** Map a RoutingGraphNode to its XYFlow type string */
  function getXYType(node: RoutingGraphNode): string {
    return node.nodeType;
  }

  /** Build node data object */
  function buildNodeData(node: RoutingGraphNode) {
    // When viewing "all" providers, color-code nodes by provider
    const providerColor = provider === "all" && node.provider
      ? getSessionProvider(node.provider ?? "claude")?.chartColor
      : undefined;
    const projectColor = providerColor
      ?? (node.projectRoot ? projectColorMap.get(node.projectRoot) || "#71717a" : "#71717a");
    return {
      label: node.label,
      absolutePath: node.absolutePath,
      displayPath: shortenPath(node.absolutePath),
      nodeType: node.nodeType,
      projectRoot: node.projectRoot,
      projectColor,
      exists: node.exists,
      fileSize: node.fileSize,
      lastModified: node.lastModified,
      outCount: outCountMap.get(node.id) || 0,
      inCount: inCountMap.get(node.id) || 0,
      childCount: node.childCount,
      isCollapsed: node.isCollapsed,
      provider: node.provider,
    };
  }

  // --- Layout ---
  if (layoutMode === "dagre") {
    // Build raw XY nodes (position will be set by dagre)
    for (const node of filteredNodes) {
      xyNodes.push({
        id: node.id,
        type: getXYType(node),
        position: { x: 0, y: 0 },
        data: buildNodeData(node),
      });
    }

    const dagreNodeSizes: Record<string, { width: number; height: number }> = {
      "claude-md": { width: 260, height: 80 },
      skill: { width: 240, height: 80 },
      agent: { width: 240, height: 80 },
      knowledge: { width: 240, height: 80 },
      folder: { width: 240, height: 60 },
      entrypoint: { width: 200, height: 56 },
    };

    // Single dagre pass over all nodes — keeps ranks aligned left-to-right
    const allEdges = filteredEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "default" as const,
    }));

    const { nodes: layouted } = getLayoutedElements(
      xyNodes,
      allEdges,
      {
        direction: "LR",
        rankSep: 82,
        nodeSep: 44,
        nodeSizes: dagreNodeSizes,
      },
    );

    // Apply layouted positions back
    for (const n of layouted) {
      const idx = xyNodes.findIndex((orig) => orig.id === n.id);
      if (idx !== -1) xyNodes[idx] = n;
    }
  } else {
    // --- Hierarchical (existing column-based layout) ---
    // Build adjacency
    const childrenMap = new Map<string, string[]>();
    const parentsMap = new Map<string, string[]>();
    for (const edge of filteredEdges) {
      const c = childrenMap.get(edge.source) || [];
      c.push(edge.target);
      childrenMap.set(edge.source, c);
      const p = parentsMap.get(edge.target) || [];
      p.push(edge.source);
      parentsMap.set(edge.target, p);
    }

    // BFS from roots to assign columns (depth)
    const column = new Map<string, number>();
    const visited = new Set<string>();
    const queue: string[] = [];

    for (const node of filteredNodes) {
      if (!parentsMap.has(node.id) || parentsMap.get(node.id)!.length === 0) {
        queue.push(node.id);
        const isHome = node.label === "CLAUDE.md" && !node.projectRoot;
        column.set(node.id, isHome ? 0 : 1);
      }
    }

    if (queue.length === 0 && filteredNodes.length > 0) {
      queue.push(filteredNodes[0].id);
      column.set(filteredNodes[0].id, 0);
    }

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const col = column.get(nodeId) || 0;
      for (const childId of childrenMap.get(nodeId) || []) {
        const existingCol = column.get(childId);
        const newCol = col + 1;
        if (existingCol === undefined || newCol > existingCol) {
          column.set(childId, newCol);
        }
        if (!visited.has(childId)) {
          queue.push(childId);
        }
      }
    }

    for (const node of filteredNodes) {
      if (!column.has(node.id)) {
        column.set(node.id, 2);
      }
    }

    const COL_WIDTH = 400;
    const NODE_HEIGHT = 80;
    const PROJECT_GAP = 60;

    const byProject = new Map<string, RoutingGraphNode[]>();
    for (const node of filteredNodes) {
      const key = node.projectRoot || "__global__";
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key)!.push(node);
    }

    const projectKeys = Array.from(byProject.keys()).sort((a, b) => {
      if (a === "__global__") return -1;
      if (b === "__global__") return 1;
      return a.localeCompare(b);
    });

    const colY = new Map<number, number>();

    for (const projectKey of projectKeys) {
      const projectNodes = byProject.get(projectKey)!;

      const byCol = new Map<number, RoutingGraphNode[]>();
      for (const node of projectNodes) {
        const col = column.get(node.id) || 0;
        if (!byCol.has(col)) byCol.set(col, []);
        byCol.get(col)!.push(node);
      }

      for (const [, colNodes] of byCol) {
        colNodes.sort((a, b) => {
          const order: Record<string, number> = { entrypoint: -1, folder: 0, "claude-md": 1, agent: 2, skill: 3, knowledge: 4 };
          const ta = order[a.nodeType] ?? 3;
          const tb = order[b.nodeType] ?? 3;
          if (ta !== tb) return ta - tb;
          return a.label.localeCompare(b.label);
        });
      }

      for (const [col, colNodes] of byCol) {
        let y = colY.get(col) || 0;

        for (const node of colNodes) {
          const x = node.position?.x ?? col * COL_WIDTH;
          const finalY = node.position?.y ?? y;

          xyNodes.push({
            id: node.id,
            type: getXYType(node),
            position: { x, y: finalY },
            data: buildNodeData(node),
          });

          y = finalY + NODE_HEIGHT;
        }

        colY.set(col, y + PROJECT_GAP);
      }
    }
  }

  // Build edges
  for (const edge of filteredEdges) {
    const edgeType = getEdgeType(edge);

    let edgeStyle: Record<string, unknown>;
    let markerColor = "#52525b";
    if (edgeType === "entrypoint") {
      markerColor = "#2563eb";
      edgeStyle = { stroke: markerColor, strokeWidth: 1.35, strokeDasharray: "6 4", opacity: 0.72 };
    } else if (edgeType === "contains") {
      markerColor = "#71717a";
      edgeStyle = { stroke: markerColor, strokeWidth: 1.2, strokeDasharray: "4 3", opacity: 0.6 };
    } else if (edgeType === "table-entry") {
      markerColor = "#14b8a6";
      edgeStyle = { stroke: markerColor, strokeWidth: 1.45, strokeDasharray: "2 4", opacity: 0.78 };
    } else if (edgeType === "manual") {
      markerColor = "#7c3aed";
      edgeStyle = { stroke: markerColor, strokeWidth: 2.05, opacity: 0.95 };
    } else {
      edgeStyle = { stroke: markerColor, strokeWidth: 1.75, opacity: 0.8 };
    }

    xyEdges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      animated: edge.isManual,
      interactionWidth: 28,
      zIndex: edgeType === "manual" ? 2 : 1,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: markerColor,
        width: 14,
        height: 14,
      },
      style: edgeStyle,
      data: {
        context: edge.context,
        referenceType: edge.referenceType,
        isManual: edge.isManual,
        edgeType,
      },
    });
  }

  return { nodes: xyNodes, edges: xyEdges };
}
