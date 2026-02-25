"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  FolderClosed,
  GripVertical,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRoutingStore } from "@/stores/routingStore";
import type { RoutingGraphNode } from "@/types/routing-graph";
import { SearchField } from "@/components/ui/search-field";
import { estimateTokensFromBytes } from "@/lib/marketplace/token-estimate";
import { formatTokens } from "@/lib/cost/calculator";

interface SidebarFile {
  name: string;
  path: string; // absolute path
  size: number | null;
  approximateTokens: number | null;
}

interface SidebarDir {
  name: string;
  path: string; // display path segment (e.g. "~/.claude")
  children: (SidebarDir | SidebarFile)[];
}

type SidebarEntry = SidebarDir | SidebarFile;

function isDir(entry: SidebarEntry): entry is SidebarDir {
  return "children" in entry;
}

function formatFileBytes(bytes: number): string {
  if (bytes > 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${bytes}B`;
}

/**
 * Build a tree of directories/files from a flat list of graph nodes.
 * Replaces the old filesystem scan approach.
 */
function buildTreeFromNodes(nodes: RoutingGraphNode[]): SidebarEntry[] {
  // Group files by their directory segments
  const root: SidebarDir = { name: "", path: "", children: [] };

  for (const node of nodes) {
    let displayPath = node.absolutePath;
    // Replace home dir prefix with ~
    const homeMatch = displayPath.match(/^\/Users\/[^/]+\//);
    const homeMatch2 = displayPath.match(/^\/home\/[^/]+\//);
    if (homeMatch) {
      displayPath = "~/" + displayPath.slice(homeMatch[0].length);
    } else if (homeMatch2) {
      displayPath = "~/" + displayPath.slice(homeMatch2[0].length);
    }

    const segments = displayPath.split("/");
    const fileName = segments.pop()!;

    // Walk/create directory path
    let current = root;
    let builtPath = "";
    for (const seg of segments) {
      builtPath = builtPath ? `${builtPath}/${seg}` : seg;
      let child = current.children.find((c) => isDir(c) && c.name === seg) as
        | SidebarDir
        | undefined;
      if (!child) {
        child = { name: seg, path: builtPath, children: [] };
        current.children.push(child);
      }
      current = child;
    }

    // Add file entry
    current.children.push({
      name: fileName,
      path: node.absolutePath,
      size: node.fileSize,
      approximateTokens:
        node.fileSize === null
          ? null
          : estimateTokensFromBytes(node.fileSize),
    });
  }

  // Sort: directories first, then files, alphabetical within each
  function sortTree(entries: SidebarEntry[]): SidebarEntry[] {
    entries.sort((a, b) => {
      const aIsDir = isDir(a);
      const bIsDir = isDir(b);
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (isDir(entry)) sortTree(entry.children);
    }
    return entries;
  }

  return sortTree(root.children);
}

function collectDirPaths(entries: SidebarEntry[]): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    if (!isDir(entry)) continue;
    if (entry.path) paths.push(entry.path);
    paths.push(...collectDirPaths(entry.children));
  }
  return paths;
}

interface RoutingSidebarProps {
  nodes: RoutingGraphNode[];
  width: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
}

export function RoutingSidebar({
  nodes,
  width,
  collapsed,
  onToggleCollapse,
  onResizeStart,
}: RoutingSidebarProps) {
  const {
    searchQuery,
    setSearchQuery,
    selectedNodeId,
    setSelectedNodeId,
    setSelectedFilePath,
    setDetailMode,
    focusTrigger,
  } = useRoutingStore();

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Refocus search input when focusTrigger changes (from toolbar filter changes or Cmd/K)
  useEffect(() => {
    if (focusTrigger > 0) {
      searchInputRef.current?.focus();
    }
  }, [focusTrigger]);

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    new Set(["~", "~/.claude"]),
  );
  const [searchCollapsedDirs, setSearchCollapsedDirs] = useState<Set<string>>(
    new Set(),
  );

  const handleFileClick = useCallback(
    (filePath: string) => {
      setSelectedNodeId(filePath);
      setSelectedFilePath(filePath);
      setDetailMode("view");
    },
    [setSelectedNodeId, setSelectedFilePath, setDetailMode],
  );

  // Build tree from graph nodes
  const tree = useMemo(() => buildTreeFromNodes(nodes), [nodes]);
  const allDirPaths = useMemo(() => collectDirPaths(tree), [tree]);

  // Filter tree by search
  const filteredTree = useMemo(() => {
    if (!searchQuery) return tree;
    const q = searchQuery.toLowerCase();

    function filterEntries(entries: SidebarEntry[]): SidebarEntry[] {
      return entries.reduce<SidebarEntry[]>((acc, entry) => {
        if (isDir(entry)) {
          const filtered = filterEntries(entry.children);
          if (filtered.length > 0) {
            acc.push({ ...entry, children: filtered });
          }
        } else {
          if (
            entry.name.toLowerCase().includes(q) ||
            entry.path.toLowerCase().includes(q)
          ) {
            acc.push(entry);
          }
        }
        return acc;
      }, []);
    }

    return filterEntries(tree);
  }, [tree, searchQuery]);
  const filteredDirPaths = useMemo(
    () => collectDirPaths(filteredTree),
    [filteredTree],
  );
  const filteredDirPathSet = useMemo(
    () => new Set(filteredDirPaths),
    [filteredDirPaths],
  );
  const effectiveExpandedDirs = useMemo(() => {
    if (!searchQuery) return expandedDirs;
    const next = new Set(expandedDirs);
    for (const dirPath of filteredDirPaths) {
      if (!searchCollapsedDirs.has(dirPath)) next.add(dirPath);
    }
    for (const dirPath of searchCollapsedDirs) {
      next.delete(dirPath);
    }
    return next;
  }, [expandedDirs, filteredDirPaths, searchCollapsedDirs, searchQuery]);

  const toggleDir = useCallback(
    (dirPath: string) => {
      if (searchQuery && filteredDirPathSet.has(dirPath)) {
        setSearchCollapsedDirs((prev) => {
          const next = new Set(prev);
          if (next.has(dirPath)) next.delete(dirPath);
          else next.add(dirPath);
          return next;
        });
        return;
      }

      setExpandedDirs((prev) => {
        const next = new Set(prev);
        if (next.has(dirPath)) next.delete(dirPath);
        else next.add(dirPath);
        return next;
      });
    },
    [filteredDirPathSet, searchQuery],
  );

  // Count total files
  const countFiles = (entries: SidebarEntry[]): number => {
    let count = 0;
    for (const entry of entries) {
      if (isDir(entry)) count += countFiles(entry.children);
      else count++;
    }
    return count;
  };
  const totalFiles = countFiles(filteredTree);
  const totalDiscoveredFiles = countFiles(tree);
  const visibleDirPaths = searchQuery ? filteredDirPaths : allDirPaths;
  const fileCountLabel = searchQuery
    ? `${totalFiles}/${totalDiscoveredFiles}`
    : `${totalFiles}`;

  const handleSearchQueryChange = useCallback(
    (nextQuery: string) => {
      if (nextQuery !== searchQuery) {
        setSearchCollapsedDirs(new Set());
      }
      setSearchQuery(nextQuery);
    },
    [searchQuery, setSearchQuery],
  );

  const handleExpandVisible = useCallback(() => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      for (const path of visibleDirPaths) next.add(path);
      return next;
    });
    if (searchQuery) {
      setSearchCollapsedDirs((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const path of visibleDirPaths) next.delete(path);
        return next;
      });
    }
  }, [searchQuery, visibleDirPaths]);

  const handleCollapseVisible = useCallback(() => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      for (const path of visibleDirPaths) next.delete(path);
      next.add("~");
      next.add("~/.claude");
      return next;
    });
    if (searchQuery) {
      setSearchCollapsedDirs((prev) => {
        const next = new Set(prev);
        for (const path of visibleDirPaths) next.add(path);
        return next;
      });
    }
  }, [searchQuery, visibleDirPaths]);

  if (collapsed) {
    return (
      <div className="w-12 border-r border-border/50 bg-card/30 backdrop-blur-sm flex flex-col items-center py-3 gap-2 shrink-0 relative">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Expand sidebar"
        >
          <ChevronRight size={14} />
        </button>
        <span className="text-meta text-muted-foreground/50 tabular-nums [writing-mode:vertical-lr] rotate-180 mt-2">
          {searchQuery ? `${totalFiles}/${totalDiscoveredFiles}` : totalFiles} files
        </span>
      </div>
    );
  }

  return (
    <div
      className="border-r border-border/50 bg-card/35 backdrop-blur-sm flex flex-col shrink-0 relative overflow-hidden"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 bg-background/40">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded text-muted-foreground hover:text-foreground"
          >
            <ChevronDown size={14} />
          </button>
          <div className="leading-tight">
            <div className="text-xs font-medium">Knowledge Files</div>
            <div className="text-micro uppercase tracking-wider text-muted-foreground/50">
              Drag into graph to link
            </div>
          </div>
        </div>
        <span className="text-meta tabular-nums text-muted-foreground/50">
          {fileCountLabel}
        </span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border/30 bg-background/20">
        <div className="relative">
          <SearchField
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => handleSearchQueryChange(e.target.value)}
            placeholder="Filter files..."
            inputSize="sm"
            className="pr-7 bg-muted/30 border-border/30 focus-visible:ring-primary/40"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearchQueryChange("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/70 transition-colors"
              title="Clear filter"
              aria-label="Clear file filter"
            >
              <X size={10} />
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-meta tabular-nums text-muted-foreground/60">
            {searchQuery
              ? `${totalFiles} match${totalFiles === 1 ? "" : "es"}`
              : `${totalDiscoveredFiles} file${totalDiscoveredFiles === 1 ? "" : "s"}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleExpandVisible}
              className="px-1.5 py-0.5 rounded text-meta text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Expand visible folders"
            >
              Expand all
            </button>
            <button
              onClick={handleCollapseVisible}
              className="px-1.5 py-0.5 rounded text-meta text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Collapse visible folders"
            >
              Collapse
            </button>
          </div>
        </div>
        {selectedNodeId && (
          <div className="mt-2 rounded-md border border-border/40 bg-background/60 px-2 py-1">
            <div className="text-micro uppercase tracking-wider text-muted-foreground/50">
              Selected
            </div>
            <div className="text-meta font-mono truncate text-muted-foreground">
              {selectedNodeId}
            </div>
          </div>
        )}
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-1 pr-1">
        {nodes.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground/50">
            No files discovered. Run a scan to index provider instruction files.
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground/50">
            No matching files
          </div>
        ) : (
          <TreeNode
            entries={filteredTree}
            depth={0}
            expandedDirs={effectiveExpandedDirs}
            onToggleDir={toggleDir}
            onFileClick={handleFileClick}
            selectedNodeId={selectedNodeId}
          />
        )}
      </div>

      {/* Resize handle */}
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors"
        onMouseDown={onResizeStart}
      />
    </div>
  );
}

function TreeNode({
  entries,
  depth,
  expandedDirs,
  onToggleDir,
  onFileClick,
  selectedNodeId,
}: {
  entries: SidebarEntry[];
  depth: number;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  onFileClick: (path: string) => void;
  selectedNodeId: string | null;
}) {
  return (
    <>
      {entries.map((entry) => {
        if (isDir(entry)) {
          const isExpanded =
            expandedDirs.has(entry.path) || expandedDirs.has(entry.name);
          return (
            <div key={entry.path}>
              <button
                onClick={() => onToggleDir(entry.path)}
                className="flex items-center gap-1.5 w-full px-2 py-1 text-xs rounded-md hover:bg-muted/50 transition-colors"
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                title={entry.path}
              >
                {isExpanded ? (
                  <ChevronDown
                    size={10}
                    className="text-muted-foreground/50 shrink-0"
                  />
                ) : (
                  <ChevronRight
                    size={10}
                    className="text-muted-foreground/50 shrink-0"
                  />
                )}
                {isExpanded ? (
                  <FolderOpen
                    size={12}
                    className="text-muted-foreground shrink-0"
                  />
                ) : (
                  <FolderClosed
                    size={12}
                    className="text-muted-foreground shrink-0"
                  />
                )}
                <span className="truncate font-medium">{entry.name}</span>
              </button>
              {isExpanded && (
                <TreeNode
                  entries={entry.children}
                  depth={depth + 1}
                  expandedDirs={expandedDirs}
                  onToggleDir={onToggleDir}
                  onFileClick={onFileClick}
                  selectedNodeId={selectedNodeId}
                />
              )}
            </div>
          );
        }

        const isSelected = selectedNodeId === entry.path;

        return (
          <button
            key={entry.path}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/knowledge-node",
                JSON.stringify({ path: entry.path, name: entry.name }),
              );
              e.dataTransfer.effectAllowed = "link";
            }}
            onClick={() => onFileClick(entry.path)}
            title={
              entry.approximateTokens !== null
                ? `${entry.path}\n~${entry.approximateTokens.toLocaleString()} tokens${
                    entry.size !== null ? ` · ${formatFileBytes(entry.size)}` : ""
                  }`
                : entry.path
            }
            className={cn(
              "w-full flex items-center gap-1.5 py-1 text-xs transition-colors group",
              isSelected
                ? "bg-primary/10 text-primary shadow-[inset_2px_0_0_0] shadow-primary/60"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
            style={{
              paddingLeft: `${depth * 12 + 20}px`,
              paddingRight: "8px",
            }}
          >
            <GripVertical
              size={8}
              className="opacity-0 group-hover:opacity-40 shrink-0 cursor-grab"
            />
            <FileText size={11} className="shrink-0" />
            <span className="flex-1 text-left truncate">{entry.name}</span>
            {entry.approximateTokens !== null ? (
              <span className="text-meta tabular-nums text-muted-foreground/40 shrink-0">
                ~{formatTokens(entry.approximateTokens)} tok
              </span>
            ) : entry.size !== null ? (
              <span className="text-meta tabular-nums text-muted-foreground/40 shrink-0">
                {formatFileBytes(entry.size)}
              </span>
            ) : null}
          </button>
        );
      })}
    </>
  );
}
