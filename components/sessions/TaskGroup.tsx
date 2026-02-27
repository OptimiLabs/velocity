"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import {
  ChevronRight,
  ChevronDown,
  Network,
  Search,
  ClipboardList,
  Terminal,
  GitBranch,
  Circle,
  Wrench,
} from "lucide-react";
import type {
  TaskSession,
  Session,
  EnrichedToolData,
  AgentEntry,
} from "@/types/session";

const LIGHTWEIGHT_TYPES = new Set(["Explore", "Bash"]);

function parseJsonField<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function parseModels(modelUsage: string): string[] {
  try {
    return Object.keys(JSON.parse(modelUsage)).map((m) =>
      m.replace(/^claude-/, "").replace(/-\d{8}$/, ""),
    );
  } catch {
    return [];
  }
}

function childLabel(type: string | null): string {
  if (type === "Explore") return "search";
  if (type === "Bash") return "bash";
  if (type === "Plan") return "plan";
  if (type === "general-purpose") return "agent";
  return type || "subagent";
}

function SubagentIcon({ type }: { type: string | null }) {
  switch (type) {
    case "Explore":
      return <Search size={12} className="text-muted-foreground shrink-0" />;
    case "Plan":
      return (
        <ClipboardList size={12} className="text-muted-foreground shrink-0" />
      );
    case "Bash":
      return <Terminal size={12} className="text-muted-foreground shrink-0" />;
    default:
      return <GitBranch size={12} className="text-muted-foreground shrink-0" />;
  }
}

function ToolsSummaryStrip({ session }: { session: TaskSession }) {
  const enriched = parseJsonField<EnrichedToolData | null>(
    session.enriched_tools,
    null,
  );
  if (!enriched) return null;

  const entries: { label: string; count: number }[] = [];

  // Core tools (Read, Write, Edit, Bash, etc.)
  for (const [name, count] of Object.entries(enriched.coreTools)) {
    if (count > 0) entries.push({ label: name, count });
  }

  // Skills (commit, review-pr, etc.)
  for (const skill of enriched.skills) {
    if (skill.count > 0)
      entries.push({ label: skill.name, count: skill.count });
  }

  // MCP tools
  for (const [name, count] of Object.entries(enriched.mcpTools)) {
    if (count > 0) entries.push({ label: name, count });
  }

  // Other tools
  for (const [name, count] of Object.entries(enriched.otherTools)) {
    if (count > 0) entries.push({ label: name, count });
  }

  if (entries.length === 0) return null;

  // Sort by count descending
  entries.sort((a, b) => b.count - a.count);

  return (
    <div className="flex items-center gap-1.5 px-4 py-1.5 bg-muted/10 border-t border-border/60 overflow-x-auto">
      <Wrench size={10} className="text-muted-foreground/50 shrink-0" />
      {entries.map((e) => (
        <span
          key={e.label}
          className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded bg-muted/60 text-muted-foreground text-micro font-mono whitespace-nowrap"
        >
          {e.label}
          <span className="text-muted-foreground/50">×{e.count}</span>
        </span>
      ))}
    </div>
  );
}

function ChildRow({
  child,
  description,
  selected,
  onToggleSelect,
}: {
  child: Session;
  description?: string;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const label = childLabel(child.subagent_type);

  return (
    <Link
      href={`/sessions/${child.id}`}
      className={`flex items-center gap-3 px-4 py-2 bg-muted/20 hover:bg-muted/40 transition-colors text-xs border-t border-border/60 ${selected ? "bg-primary/5" : ""}`}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={!!selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect(child.id)}
          className="h-3 w-3 rounded border-border accent-primary cursor-pointer"
        />
      )}
      <div className="w-4" />
      <SubagentIcon type={child.subagent_type} />
      <Badge variant="secondary" className="text-micro px-1.5 py-0 shrink-0">
        {label}
      </Badge>
      {description && (
        <span className="text-muted-foreground/60 truncate max-w-[240px]">
          {description}
        </span>
      )}
      <span className="text-muted-foreground tabular-nums">
        {child.message_count} msgs
      </span>
      <span className="text-foreground tabular-nums font-medium">
        {formatCost(child.total_cost)}
      </span>
      <span className="text-muted-foreground tabular-nums">
        {formatTokens(child.input_tokens + child.output_tokens)} tok
      </span>
      <span className="text-muted-foreground/50 ml-auto" suppressHydrationWarning>
        {formatDistanceToNow(new Date(child.created_at), { addSuffix: true })}
      </span>
    </Link>
  );
}

export function TaskGroup({
  session,
  defaultExpanded = false,
  selectedIds,
  onToggleSelect,
}: {
  session: TaskSession;
  defaultExpanded?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = session.children.length > 0;

  const aggregatedCost =
    session.total_cost +
    session.children.reduce((sum, c) => sum + c.total_cost, 0);
  const models = parseModels(session.model_usage);
  const projectName = session.project_path
    ? session.project_path.split("/").pop() || session.project_path
    : null;
  const prompt = session.summary || session.first_prompt || "";
  const truncated = prompt.length > 80 ? prompt.slice(0, 77) + "..." : prompt;

  // Extract agent descriptions from the parent session's enriched_tools
  const enrichedData = parseJsonField<EnrichedToolData | null>(
    session.enriched_tools,
    null,
  );
  const agents: AgentEntry[] = enrichedData?.agents || [];

  // Classify children into agents vs tools for the badge
  const agentCount = session.children.filter(
    (c) => !LIGHTWEIGHT_TYPES.has(c.subagent_type || ""),
  ).length;
  const toolCount = session.children.length - agentCount;

  let badgeLabel: string;
  if (agentCount > 0 && toolCount > 0) {
    badgeLabel = `${agentCount} agent${agentCount !== 1 ? "s" : ""} · ${toolCount} tool${toolCount !== 1 ? "s" : ""}`;
  } else if (agentCount > 0) {
    badgeLabel = `${agentCount} agent${agentCount !== 1 ? "s" : ""}`;
  } else {
    badgeLabel = `${toolCount} tool${toolCount !== 1 ? "s" : ""}`;
  }

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      {/* Parent row */}
      <div
        className={`flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer ${selectedIds?.includes(session.id) ? "bg-primary/5" : ""}`}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {/* Selection checkbox */}
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selectedIds?.includes(session.id) ?? false}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(session.id);
            }}
            onChange={() => {}}
            className="h-3 w-3 rounded border-border accent-primary cursor-pointer shrink-0"
          />
        )}
        {/* Expand/collapse chevron */}
        <div className="w-4 shrink-0 flex items-center justify-center">
          {hasChildren ? (
            expanded ? (
              <ChevronDown size={12} className="text-muted-foreground" />
            ) : (
              <ChevronRight size={12} className="text-muted-foreground" />
            )
          ) : (
            <Circle size={5} className="text-muted-foreground/40" />
          )}
        </div>

        {/* Role badge */}
        {hasChildren ? (
          <Network size={12} className="text-blue-500 dark:text-blue-400 shrink-0" />
        ) : (
          <Circle size={5} className="text-muted-foreground/30 shrink-0" />
        )}

        {/* Session info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/sessions/${session.id}`}
              className="font-mono text-xs text-foreground/90 truncate hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {session.slug || session.id.slice(0, 12)}
            </Link>
            {truncated && (
              <span className="text-xs text-muted-foreground/60 truncate hidden sm:inline">
                {truncated}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {projectName && (
              <span className="text-micro text-muted-foreground/50 truncate max-w-[120px]">
                {projectName}
              </span>
            )}
            {models.map((m) => (
              <span
                key={m}
                className="inline-block px-1 py-0 rounded bg-muted text-muted-foreground text-micro font-mono"
              >
                {m}
              </span>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 shrink-0 text-xs tabular-nums">
          <span className="text-muted-foreground">
            {session.message_count} msgs
          </span>
          <span className="font-medium text-foreground">
            {formatCost(aggregatedCost)}
          </span>
          <span className="text-muted-foreground">
            {formatTokens(session.input_tokens + session.output_tokens)} tok
          </span>
          {hasChildren && (
            <Badge
              variant="secondary"
              className="text-micro px-1.5 py-0 bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20"
            >
              {badgeLabel}
            </Badge>
          )}
          <span className="text-meta whitespace-nowrap" suppressHydrationWarning>
            {formatDistanceToNow(new Date(session.modified_at), {
              addSuffix: true,
            })}
          </span>
        </div>
      </div>

      {/* Expanded content: tools summary + children rows */}
      {expanded && hasChildren && (
        <>
          <ToolsSummaryStrip session={session} />
          {session.children.map((child, idx) => (
            <ChildRow
              key={child.id}
              child={child}
              description={agents[idx]?.description}
              selected={selectedIds?.includes(child.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </>
      )}
    </div>
  );
}
