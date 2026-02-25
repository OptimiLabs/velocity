"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Sparkles, MessageSquare, Zap, Plus } from "lucide-react";
import { useSessions } from "@/hooks/useSessions";
import { useDebounce } from "@/hooks/useDebounce";
import { formatCost, formatTokens, getTotalTokens } from "@/lib/cost/calculator";
import type { Session } from "@/types/session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchField } from "@/components/ui/search-field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TablePagination } from "@/components/ui/table-pagination";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

interface AnalyzeSessionPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (sessionIds: string[]) => void;
  initialSelectedIds?: string[];
  title?: string;
  description?: string;
  confirmLabel?: string;
}

function SessionRow({
  session,
  checked,
  onToggle,
}: {
  session: Session;
  checked: boolean;
  onToggle: () => void;
}) {
  const title = session.slug || session.id.slice(0, 12);
  const summary = session.summary || session.first_prompt || "No prompt recorded";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "w-full rounded-xl border p-3 text-left transition-colors",
        checked
          ? "border-primary/40 bg-primary/5"
          : "border-border/50 bg-background/40 hover:bg-muted/40",
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
          aria-label={`Select ${title}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold truncate max-w-[18rem]">
              {title}
            </span>
            {session.session_role === "subagent" && (
              <Badge variant="secondary" className="text-[10px]">
                {session.subagent_type || "subagent"}
              </Badge>
            )}
            {session.provider && (
              <Badge variant="outline" className="text-[10px] uppercase">
                {session.provider}
              </Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {summary}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
            <span className="inline-flex items-center gap-1">
              <MessageSquare size={11} />
              {session.message_count}
            </span>
            <span className="inline-flex items-center gap-1">
              <Zap size={11} />
              {formatTokens(getTotalTokens(session))}
            </span>
            <span className="font-medium text-foreground">
              {formatCost(session.total_cost)}
            </span>
            <span>
              {formatDistanceToNow(new Date(session.modified_at), {
                addSuffix: true,
              })}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

export function AnalyzeSessionPickerDialog({
  open,
  onOpenChange,
  onConfirm,
  initialSelectedIds = [],
  title = "Pick Sessions",
  description = "Search by slug, prompt, or session ID. The picker shows titles and summaries so you don’t need raw IDs.",
  confirmLabel = "Start Analysis",
}: AnalyzeSessionPickerDialogProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(initialSelectedIds),
  );

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setSelectedIds(new Set(initialSelectedIds));
      setSearch("");
      setPage(0);
    }
    onOpenChange(nextOpen);
  };

  const { data, isLoading, isFetching } = useSessions({
    search: debouncedSearch || undefined,
    sortBy: "modified_at",
    sortDir: "DESC",
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    minMessages: 1,
    enabled: open,
  });

  const sessions = data?.sessions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const selectedCount = selectedIds.size;
  const selectedSorted = useMemo(() => Array.from(selectedIds), [selectedIds]);

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchField
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search sessions by title, prompt, or ID"
              inputSize="sm"
              containerClassName="min-w-[16rem] flex-1"
              autoFocus
            />
            <Badge variant="outline" className="tabular-nums">
              {total.toLocaleString()} found
            </Badge>
            {selectedCount > 0 && (
              <Badge variant="secondary" className="tabular-nums">
                {selectedCount} selected
              </Badge>
            )}
          </div>

          <div className="rounded-xl border border-border/50 bg-card/40">
            <div className="max-h-[26rem] overflow-y-auto p-3 space-y-2">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))
              ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-xl bg-muted/40 p-3 mb-3">
                    <Sparkles size={18} className="text-muted-foreground/60" />
                  </div>
                  <p className="text-sm font-medium">No sessions found</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                    Try a different search term or clear the filter to browse recent sessions.
                  </p>
                </div>
              ) : (
                sessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    checked={selectedIds.has(session.id)}
                    onToggle={() =>
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(session.id)) next.delete(session.id);
                        else next.add(session.id);
                        return next;
                      })
                    }
                  />
                ))
              )}
            </div>
            <div className="border-t border-border/50 px-3 py-2">
              <TablePagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border/50 px-5 py-3 bg-muted/20">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSelectedIds(new Set())}
            disabled={selectedCount === 0}
          >
            Clear
          </Button>
          <Button
            size="sm"
            onClick={() => onConfirm(selectedSorted)}
            disabled={selectedCount === 0 || isFetching}
            className="h-7 gap-1.5 text-xs"
          >
            <Plus size={14} />
            {confirmLabel}
            {selectedCount > 0 ? ` (${selectedCount})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
