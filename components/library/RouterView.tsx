"use client";

import { useState, useMemo, useCallback } from "react";
import {
  CheckCircle,
  AlertCircle,
  FileQuestion,
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type NodeTypes,
} from "@xyflow/react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HubNode } from "./router-nodes/HubNode";
import { CategoryNode } from "./router-nodes/CategoryNode";
import { FileNode } from "./router-nodes/FileNode";
import { buildRouterGraph } from "@/lib/instructions/router-graph";
import { useSyncRouter } from "@/hooks/useInstructions";
import type { InstructionFile } from "@/types/instructions";
import type { RouterEntry } from "@/lib/instructions/router-parser";

const nodeTypes: NodeTypes = {
  hub: HubNode,
  category: CategoryNode,
  file: FileNode,
};

const DEFAULT_ENTRIES: RouterEntry[] = [
  {
    trigger: "Tables, lists, data grids, sorting",
    path: "frontend/tables-and-lists.md",
    category: "frontend",
    type: "knowledge",
  },
  {
    trigger: "Forms, inputs, validation",
    path: "frontend/forms-and-validation.md",
    category: "frontend",
    type: "knowledge",
  },
  {
    trigger: "Pagination, filtering, URL search params",
    path: "frontend/pagination-and-filters.md",
    category: "frontend",
    type: "knowledge",
  },
  {
    trigger: "React Query vs Zustand vs local state",
    path: "frontend/state-management.md",
    category: "frontend",
    type: "knowledge",
  },
  {
    trigger: "Loading skeletons, error boundaries",
    path: "frontend/loading-and-errors.md",
    category: "frontend",
    type: "knowledge",
  },
  {
    trigger: "API routes, error responses",
    path: "backend/api-design.md",
    category: "backend",
    type: "knowledge",
  },
  {
    trigger: "DB schema, indexes, migrations",
    path: "backend/database-patterns.md",
    category: "backend",
    type: "knowledge",
  },
  {
    trigger: "Performance, caching",
    path: "backend/caching-and-performance.md",
    category: "backend",
    type: "knowledge",
  },
  {
    trigger: "Next.js routing, server components",
    path: "frameworks/nextjs.md",
    category: "frameworks",
    type: "knowledge",
  },
  {
    trigger: "React hooks, composition",
    path: "frameworks/react.md",
    category: "frameworks",
    type: "knowledge",
  },
  {
    trigger: "Tailwind classes, cn()",
    path: "frameworks/tailwind.md",
    category: "frameworks",
    type: "knowledge",
  },
  {
    trigger: "TypeScript generics, inference",
    path: "frameworks/typescript.md",
    category: "frameworks",
    type: "knowledge",
  },
  {
    trigger: "Context running low, preserving work",
    path: "workflows/session-management.md",
    category: "workflows",
    type: "knowledge",
  },
  {
    trigger: "Architecture/implementation decisions",
    path: "workflows/decision-making.md",
    category: "workflows",
    type: "knowledge",
  },
  {
    trigger: "Fixing failing tests",
    path: "workflows/test-fixing.md",
    category: "workflows",
    type: "knowledge",
  },
  {
    trigger: "Debugging, root causes",
    path: "workflows/debugging.md",
    category: "workflows",
    type: "knowledge",
  },
  { trigger: "Git commits, branches", path: "tools/git.md", category: "tools", type: "knowledge" },
  {
    trigger: "SQLite, better-sqlite3",
    path: "tools/sqlite.md",
    category: "tools",
    type: "knowledge",
  },
  { trigger: "Bun runtime", path: "tools/bun.md", category: "tools", type: "knowledge" },
];

interface RouterViewProps {
  files: InstructionFile[];
  onSelectFile?: (file: InstructionFile) => void;
}

export function RouterView({ files, onSelectFile }: RouterViewProps) {
  const [routerEntries, setRouterEntries] =
    useState<RouterEntry[]>(DEFAULT_ENTRIES);
  const syncRouter = useSyncRouter();

  const analysis = useMemo(() => {
    const filePathSet = new Set(
      files.map((f) => {
        const match = f.filePath.match(/knowledge\/(.+)$/);
        return match ? match[1] : "";
      }),
    );

    const routerPaths = new Set(routerEntries.map((e) => e.path));

    const entries = routerEntries.map((entry) => ({
      ...entry,
      exists: filePathSet.has(entry.path),
    }));

    const orphaned = files.filter((f) => {
      const match = f.filePath.match(/knowledge\/(.+)$/);
      const relPath = match ? match[1] : "";
      return !routerPaths.has(relPath);
    });

    const missing = entries.filter((e) => !e.exists);
    const connected = entries.filter((e) => e.exists);

    return { entries, orphaned, missing, connected };
  }, [files, routerEntries]);

  const { nodes, edges } = useMemo(
    () => buildRouterGraph(routerEntries, files, analysis.orphaned),
    [routerEntries, files, analysis.orphaned],
  );

  const handleSync = async () => {
    try {
      const result = await syncRouter.mutateAsync(undefined);
      if (result.entries && result.entries.length > 0) {
        setRouterEntries(result.entries);
      }
    } catch {
      // Error handled by mutation
    }
  };

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!onSelectFile) return;
      if (node.type !== "file") return;

      const nodePath = (node.data as { path?: string }).path;
      if (!nodePath) return;

      const matchedFile = files.find((f) => f.filePath.endsWith(nodePath));
      if (matchedFile) {
        onSelectFile(matchedFile);
      }
    },
    [files, onSelectFile],
  );

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border border-border/50 bg-card">
          <div className="flex items-center gap-2 text-green-500 dark:text-green-400 mb-1">
            <CheckCircle size={14} />
            <span className="text-xs">Routed &amp; Found on Disk</span>
          </div>
          <span className="text-lg font-medium tabular-nums">
            {analysis.connected.length}
          </span>
        </div>
        <div className="p-3 rounded-lg border border-border/50 bg-card">
          <div className="flex items-center gap-2 text-red-500 dark:text-red-400 mb-1">
            <AlertCircle size={14} />
            <span className="text-xs">Routed but Missing on Disk</span>
          </div>
          <span
            className={cn(
              "text-lg font-medium tabular-nums",
              analysis.missing.length > 0 ? "text-red-500 dark:text-red-400" : "",
            )}
          >
            {analysis.missing.length}
          </span>
        </div>
        <div className="p-3 rounded-lg border border-border/50 bg-card">
          <div className="flex items-center gap-2 text-yellow-500 dark:text-yellow-400 mb-1">
            <FileQuestion size={14} />
            <span className="text-xs">On Disk but Not in CLAUDE.md</span>
          </div>
          <span
            className={cn(
              "text-lg font-medium tabular-nums",
              analysis.orphaned.length > 0 ? "text-yellow-500 dark:text-yellow-400" : "",
            )}
          >
            {analysis.orphaned.length}
          </span>
        </div>
      </div>

      {/* Sync button + graph */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Knowledge routing flow from CLAUDE.md to files on disk
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={handleSync}
            disabled={syncRouter.isPending}
          >
            {syncRouter.isPending ? (
              <Loader2 size={14} className="animate-spin mr-1.5" />
            ) : (
              <RefreshCw size={14} className="mr-1.5" />
            )}
            Sync from CLAUDE.md
          </Button>
        </div>

        <div className="h-[500px] rounded-lg border border-border/50 bg-card overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            minZoom={0.3}
            maxZoom={1.5}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
