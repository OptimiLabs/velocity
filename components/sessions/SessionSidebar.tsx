"use client";

import { format } from "date-fns";
import { GitBranch, Folder, Hash, Clock, Timer, Activity, Brain, Tag } from "lucide-react";
import type { Session, EnrichedToolData } from "@/types/session";
import { formatCost } from "@/lib/cost/calculator";
import { CategorizedTools } from "./CategorizedTools";
import { CostAnalysisPanel } from "./CostAnalysisPanel";
import { DataUtilizedSection } from "./DataUtilizedSection";
import type { ModelUsageEntry } from "@/types/session";
import { Badge } from "@/components/ui/badge";

function parseJsonField<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function shortenPath(value: string): string {
  return value.replace(/^\/Users\/[^/]+/, "~");
}

function normalizeProvider(provider: string | null | undefined): "claude" | "codex" | "gemini" {
  if (provider === "codex" || provider === "gemini") return provider;
  return "claude";
}

type ProviderNote = {
  id: "claude" | "codex" | "gemini";
  label: string;
  lines: string[];
};

function getProviderNotes(cacheWriteUnavailable: boolean): ProviderNote[] {
  return [
    {
      id: "claude",
      label: "Claude",
      lines: [
        "Input/output and cache tokens come from message usage when available.",
        "Thinking blocks are shown in transcript; separate reasoning token fields are not always present.",
        "When usage cost is missing, cost is estimated from model pricing.",
      ],
    },
    {
      id: "codex",
      label: "Codex",
      lines: [
        "Reasoning tokens are shown separately and included in billable output/cost.",
        cacheWriteUnavailable
          ? "Cache write tokens are N/A when Codex logs omit that field."
          : "Cache read/write tokens are shown when present in Codex token_count events.",
        "Per-message usage is reconstructed from token_count events.",
      ],
    },
    {
      id: "gemini",
      label: "Gemini",
      lines: [
        "Input/output/cached tokens are read from model-turn usage fields.",
        "Cache write and explicit reasoning token fields are often not provided in Gemini logs.",
        "When usage cost is missing, cost is estimated from model pricing.",
      ],
    },
  ];
}

function SidebarSection({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      {title && (
        <div className="mb-2.5 flex items-center gap-2">
          <h3 className="text-[10px] font-semibold text-muted-foreground/75 uppercase tracking-[0.14em]">
            {title}
          </h3>
          <div className="h-px flex-1 bg-border/40" />
        </div>
      )}
      {children}
    </div>
  );
}

export function SessionSidebar({
  session,
  cacheWriteUnavailable = false,
}: {
  session: Session;
  cacheWriteUnavailable?: boolean;
}) {
  const modelUsage = parseJsonField<Record<string, ModelUsageEntry>>(
    session.model_usage,
    {},
  );
  const defaultEnriched: EnrichedToolData = {
    skills: [],
    agents: [],
    mcpTools: {},
    coreTools: {},
    otherTools: {},
    filesModified: [],
    filesRead: [],
    searchedPaths: [],
  };
  const enrichedTools = {
    ...defaultEnriched,
    ...parseJsonField<Partial<EnrichedToolData>>(session.enriched_tools, {}),
  };
  const modelEntries = Object.values(modelUsage);
  const tags = parseJsonField<string[]>(session.tags, []).filter(
    (tag): tag is string => typeof tag === "string",
  );
  const hasEnrichedData =
    enrichedTools.skills.length > 0 ||
    enrichedTools.agents.length > 0 ||
    Object.keys(enrichedTools.mcpTools).length > 0 ||
    Object.keys(enrichedTools.otherTools).length > 0 ||
    Object.keys(enrichedTools.coreTools).length > 0;
  const hasFileData =
    enrichedTools.filesRead.length > 0 ||
    enrichedTools.filesModified.length > 0;
  const activeProvider = normalizeProvider(session.provider);
  const providerNotes = getProviderNotes(cacheWriteUnavailable);

  return (
    <div className="w-full xl:w-[22rem] shrink-0 rounded-2xl border border-border/50 bg-card/60 shadow-sm divide-y divide-border/35 overflow-hidden xl:max-h-[calc(100vh-7.5rem)] xl:overflow-y-auto">
      {/* Session metadata */}
      <SidebarSection>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-foreground min-w-0">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background/60">
                <Hash size={12} className="text-muted-foreground/70" />
              </div>
              <span className="font-mono font-semibold truncate" title={session.id}>
                {session.id.slice(0, 12)}
              </span>
            </div>
            <Badge variant="outline" className="text-[10px] capitalize shrink-0">
              {session.session_role}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {session.provider && (
              <Badge variant="secondary" className="text-[10px] uppercase">
                {session.provider}
              </Badge>
            )}
            {session.subagent_type && (
              <Badge variant="secondary" className="text-[10px]">
                {session.subagent_type}
              </Badge>
            )}
          </div>

          <div className="space-y-1.5 rounded-xl border border-border/40 bg-background/40 p-2.5">
            {session.git_branch && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
                <GitBranch size={11} className="shrink-0" />
                <span className="font-mono truncate">{session.git_branch}</span>
              </div>
            )}
            {session.project_path && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
                <Folder size={11} className="shrink-0" />
                <span className="truncate" title={session.project_path}>
                  {shortenPath(session.project_path)}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
              <Clock size={11} className="shrink-0" />
              <span>
                {format(new Date(session.created_at), "MMM d, HH:mm")} —{" "}
                {format(new Date(session.modified_at), "HH:mm")}
              </span>
            </div>
          </div>
        </div>
      </SidebarSection>

      <SidebarSection title="Overview">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/40 bg-background/50 px-2.5 py-2">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
              <Timer size={10} />
              Duration
            </div>
            <div className="mt-1 text-xs font-medium tabular-nums">
              {formatDuration(session.session_duration_ms)}
            </div>
          </div>
          <div className="rounded-lg border border-border/40 bg-background/50 px-2.5 py-2">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
              <Activity size={10} />
              Reply Latency
            </div>
            <div className="mt-1 text-xs font-medium tabular-nums">
              {session.avg_latency_ms > 0 ? `${Math.round(session.avg_latency_ms)}ms` : "—"}
            </div>
            {session.p95_latency_ms > 0 && (
              <div className="text-[10px] text-muted-foreground/60 tabular-nums">
                per turn · p95 {Math.round(session.p95_latency_ms)}ms
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border/40 bg-background/50 px-2.5 py-2">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
              <Brain size={10} />
              Thinking
            </div>
            <div className="mt-1 text-xs font-medium tabular-nums">
              {session.thinking_blocks.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border border-border/40 bg-background/50 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              Messages
            </div>
            <div className="mt-1 text-xs font-medium tabular-nums">
              {session.message_count.toLocaleString()}
            </div>
          </div>
          <div className="col-span-2 rounded-lg border border-border/40 bg-background/50 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              Cache Tokens
            </div>
            <div className="mt-1 text-xs font-medium tabular-nums">
              {session.cache_read_tokens.toLocaleString()} read ·{" "}
              {cacheWriteUnavailable
                ? "N/A write"
                : `${session.cache_write_tokens.toLocaleString()} write`}
            </div>
            {cacheWriteUnavailable && (
              <div className="mt-0.5 text-[10px] text-muted-foreground/60">
                Codex logs currently omit cache write token metrics.
              </div>
            )}
          </div>
        </div>
      </SidebarSection>

      <SidebarSection title="Provider Metrics">
        <div className="space-y-2">
          <div className="text-[10px] text-muted-foreground/70 leading-relaxed">
            Token and cost fields differ by provider. This reference explains what
            each provider typically reports in this session view.
          </div>
          {providerNotes.map((note) => {
            const isActive = note.id === activeProvider;
            return (
              <div
                key={note.id}
                className={`rounded-lg border px-2.5 py-2 text-xs ${
                  isActive
                    ? "border-primary/30 bg-primary/5"
                    : "border-border/40 bg-background/40"
                }`}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <Badge variant={isActive ? "default" : "secondary"} className="text-[10px] uppercase">
                    {note.label}
                  </Badge>
                  {isActive && (
                    <span className="text-[10px] text-primary">Current provider</span>
                  )}
                </div>
                <ul className="space-y-1 text-[11px] text-muted-foreground/85 leading-relaxed">
                  {note.lines.map((line) => (
                    <li key={line} className="flex items-start gap-1.5">
                      <span className="mt-1 h-1 w-1 rounded-full bg-muted-foreground/60 shrink-0" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </SidebarSection>

      {tags.length > 0 && (
        <SidebarSection title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 20).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="text-[10px] font-normal"
              >
                <Tag size={9} />
                {tag}
              </Badge>
            ))}
            {tags.length > 20 && (
              <span className="text-[10px] text-muted-foreground">
                +{tags.length - 20} more
              </span>
            )}
          </div>
        </SidebarSection>
      )}

      {/* Cost */}
      <SidebarSection title="Cost">
        <CostAnalysisPanel
          session={session}
          cacheWriteUnavailable={cacheWriteUnavailable}
        />
      </SidebarSection>

      {/* Files — shown if data exists */}
      {hasFileData && (
        <SidebarSection title="Files">
          <DataUtilizedSection
            filesRead={enrichedTools.filesRead}
            filesModified={enrichedTools.filesModified}
          />
        </SidebarSection>
      )}

      {/* Tools — shown if data exists */}
      {hasEnrichedData && (
        <SidebarSection title="Tools">
          <CategorizedTools data={enrichedTools} />
        </SidebarSection>
      )}

      {/* Models */}
      {modelEntries.length > 0 && (
        <SidebarSection title="Models">
          <div className="space-y-2">
            {modelEntries.map((m) => (
              <div
                key={m.model}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/40 px-2.5 py-2 text-xs"
              >
                <span className="font-mono text-xs text-foreground/70 truncate mr-2">
                  {m.model}
                </span>
                <span className="tabular-nums text-muted-foreground/80 text-xs shrink-0">
                  {formatCost(m.cost)}
                </span>
              </div>
            ))}
          </div>
        </SidebarSection>
      )}
    </div>
  );
}
