"use client";

import { useState, useMemo } from "react";
import {
  useDataUtilization,
  type AnalyticsFilters,
  type DataUtilizationCategory,
  type DataUtilizationFile,
} from "@/hooks/useAnalytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileSearch,
  RefreshCw,
  ChevronDown,
  FolderGit2,
  Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import {
  buildRepoGroups,
  getAutoExpandedPaths,
  type FileTreeNode,
  type RepoGroup,
} from "./file-tree-utils";

const CATEGORY_COLORS: Record<string, string> = {
  knowledge: "bg-chart-1",
  instruction: "bg-chart-2",
  agent: "bg-chart-3",
  config: "bg-chart-4",
  code: "bg-chart-5",
  other: "bg-muted-foreground/50",
};

interface DataUtilizationCardProps {
  from: string;
  to: string;
  filters: AnalyticsFilters;
}

export function DataUtilizationCard({
  from,
  to,
  filters,
}: DataUtilizationCardProps) {
  const { data, isLoading } = useDataUtilization(from, to, filters);

  if (isLoading) {
    return <Skeleton className="h-64" />;
  }

  if (!data) return null;

  // Empty state: suggest re-index
  if (data.totals.sessionsWithReads === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FileSearch size={14} />
            File Reads (Tool Usage)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground">
            <RefreshCw size={24} className="mb-3 text-muted-foreground/50" />
            <p>No file read data available yet.</p>
            <p className="text-xs mt-1">
              Re-index sessions to populate data utilization tracking.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Find max cost for bar scaling
  const maxCost = Math.max(
    ...data.categories.map((c) => c.estimatedCost),
    0.01,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <FileSearch size={14} />
          File Reads (Tool Usage)
        </CardTitle>
        <p className="text-xs text-muted-foreground -mt-1">
          Files accessed via Read tool during sessions
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Category cost breakdown */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-3">
              Category Breakdown
            </div>
            <div className="space-y-2">
              {data.categories.map((cat: DataUtilizationCategory) => (
                <CategoryBar
                  key={cat.category}
                  category={cat}
                  maxCost={maxCost}
                />
              ))}
            </div>
          </div>

          {/* Right: Repo-grouped file tree */}
          <FileTreeView files={data.topFiles} />
        </div>

        {/* Footer summary */}
        <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
          {data.totals.uniqueFiles} unique files read across{" "}
          {data.totals.sessionsWithReads} sessions
          {data.totals.totalReadCost > 0 && (
            <>
              {" "}
              &middot; {formatCost(data.totals.totalReadCost)} total read cost
            </>
          )}
          {data.totals.totalReadTokens > 0 && (
            <> &middot; {formatTokens(data.totals.totalReadTokens)} tokens</>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Filter pills ──────────────────────────────────────────────────

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "knowledge", label: "Knowledge" },
  { value: "instruction", label: "Instructions" },
  { value: "code", label: "Code" },
] as const;

type FileFilter = (typeof FILTER_OPTIONS)[number]["value"];

// ── File Tree View ────────────────────────────────────────────────

function FileTreeView({ files }: { files: DataUtilizationFile[] }) {
  const [filter, setFilter] = useState<FileFilter>("all");

  const filtered = useMemo(
    () =>
      filter === "all" ? files : files.filter((f) => f.category === filter),
    [files, filter],
  );

  const groups = useMemo(() => buildRepoGroups(filtered), [filtered]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set<string>(),
  );

  // Auto-expand on first render when groups change
  const [lastGroupKey, setLastGroupKey] = useState("");
  const groupKey = groups.map((g) => g.projectPath).join("|");
  if (groupKey !== lastGroupKey) {
    setLastGroupKey(groupKey);
    setExpandedPaths(getAutoExpandedPaths(groups));
  }

  const catSet = new Set(files.map((f) => f.category));

  const toggle = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground">
          Files by Repository
        </span>
        <div className="flex gap-0.5">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              disabled={opt.value !== "all" && !catSet.has(opt.value)}
              className={cn(
                "px-1.5 py-0.5 text-meta rounded transition-colors",
                filter === opt.value
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground/70 hover:text-muted-foreground",
                opt.value !== "all" &&
                  !catSet.has(opt.value) &&
                  "opacity-30 cursor-not-allowed",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {groups.length > 0 ? (
        <div className="max-h-[400px] overflow-y-auto -mx-1 px-1">
          {groups.map((group) => (
            <RepoSection
              key={group.projectPath}
              group={group}
              expandedPaths={expandedPaths}
              toggle={toggle}
            />
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground py-4 text-center">
          No files read in this period
          {filter !== "all" && " for this category"}.
        </div>
      )}
    </div>
  );
}

// ── Repo Section ──────────────────────────────────────────────────

function RepoSection({
  group,
  expandedPaths,
  toggle,
}: {
  group: RepoGroup;
  expandedPaths: Set<string>;
  toggle: (path: string) => void;
}) {
  const repoKey = `repo:${group.projectPath}`;
  const expanded = expandedPaths.has(repoKey);

  return (
    <div className="mb-1">
      <button
        onClick={() => toggle(repoKey)}
        className="flex items-center justify-between w-full text-xs px-1.5 py-1 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-1.5 font-medium truncate">
          <ChevronDown
            size={12}
            className={cn(
              "shrink-0 transition-transform",
              !expanded && "-rotate-90",
            )}
          />
          <FolderGit2 size={12} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{group.projectName}</span>
          <span className="text-muted-foreground font-normal">
            ({group.fileCount} file{group.fileCount !== 1 ? "s" : ""})
          </span>
        </span>
        <span className="text-muted-foreground tabular-nums shrink-0 ml-2">
          {formatCost(group.estimatedCost)}
        </span>
      </button>

      {expanded && (
        <div className="mt-0.5">
          {group.root.children.map((child) => (
            <TreeNodeRow
              key={child.fullPath}
              node={child}
              depth={0}
              repoKey={repoKey}
              expandedPaths={expandedPaths}
              toggle={toggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tree Node Row ─────────────────────────────────────────────────

function TreeNodeRow({
  node,
  depth,
  repoKey,
  expandedPaths,
  toggle,
}: {
  node: FileTreeNode;
  depth: number;
  repoKey: string;
  expandedPaths: Set<string>;
  toggle: (path: string) => void;
}) {
  const nodeKey = `${repoKey}/${node.fullPath}`;
  const expanded = expandedPaths.has(nodeKey);
  const indent = 12 + depth * 16;

  if (node.isFile) {
    const category = node.file?.category ?? "other";
    return (
      <div
        className="flex items-center justify-between text-xs py-0.5 rounded hover:bg-muted/50 transition-colors"
        style={{ paddingLeft: `${indent}px`, paddingRight: "6px" }}
      >
        <span className="flex items-center gap-1.5 truncate mr-2">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0",
              CATEGORY_COLORS[category] ?? "bg-muted-foreground/50",
            )}
          />
          <span className="font-mono text-meta truncate">{node.name}</span>
        </span>
        <span className="text-muted-foreground tabular-nums shrink-0 text-meta">
          {node.totalReads}r
          {node.estimatedCost > 0 && (
            <> &middot; {formatCost(node.estimatedCost)}</>
          )}
        </span>
      </div>
    );
  }

  // Directory node
  return (
    <>
      <button
        onClick={() => toggle(nodeKey)}
        className="flex items-center justify-between w-full text-xs py-0.5 rounded hover:bg-muted/50 transition-colors"
        style={{ paddingLeft: `${indent}px`, paddingRight: "6px" }}
      >
        <span className="flex items-center gap-1.5 truncate">
          <ChevronDown
            size={10}
            className={cn(
              "shrink-0 transition-transform text-muted-foreground",
              !expanded && "-rotate-90",
            )}
          />
          <Folder size={11} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{node.name}</span>
          <span className="text-muted-foreground">({node.fileCount})</span>
        </span>
        <span className="text-muted-foreground tabular-nums shrink-0 text-meta ml-2">
          {formatCost(node.estimatedCost)}
        </span>
      </button>
      {expanded &&
        node.children.map((child) => (
          <TreeNodeRow
            key={child.fullPath}
            node={child}
            depth={depth + 1}
            repoKey={repoKey}
            expandedPaths={expandedPaths}
            toggle={toggle}
          />
        ))}
    </>
  );
}

// ── Category Bar (unchanged) ──────────────────────────────────────

function CategoryBar({
  category,
  maxCost,
}: {
  category: DataUtilizationCategory;
  maxCost: number;
}) {
  const pct = maxCost > 0 ? (category.estimatedCost / maxCost) * 100 : 0;
  const colorClass =
    CATEGORY_COLORS[category.category] ?? "bg-muted-foreground/50";

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-sm ${colorClass}`} />
          <span>{category.label}</span>
          <span className="text-muted-foreground">
            ({category.fileCount} files)
          </span>
        </span>
        <span className="tabular-nums text-muted-foreground">
          {formatCost(category.estimatedCost)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${colorClass}`}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
    </div>
  );
}
