"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { History, Plus, Clock3, MessageSquare } from "lucide-react";
import { CompareWorkspace } from "@/components/workspace/CompareWorkspace";
import { AnalysisHistory } from "@/components/workspace/AnalysisHistory";
import { AnalyzeSessionPickerDialog } from "@/components/workspace/AnalyzeSessionPickerDialog";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSessions } from "@/hooks/useSessions";
import { formatCost } from "@/lib/cost/calculator";

function AnalyzePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);

  const ids = useMemo(
    () =>
      (searchParams.get("ids") || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    [searchParams],
  );
  const conversationId = searchParams.get("conversationId") || null;
  const hasWorkspace = ids.length > 0 || !!conversationId;
  const { data: recentSessionsData, isLoading: recentSessionsLoading } =
    useSessions({
      sortBy: "modified_at",
      sortDir: "DESC",
      limit: 8,
      minMessages: 1,
      enabled: !hasWorkspace,
    });
  const recentSessions = recentSessionsData?.sessions ?? [];

  const handleStartWithSessions = (sessionIds: string[]) => {
    if (sessionIds.length === 0) return;
    const params = new URLSearchParams();
    params.set("ids", sessionIds.join(","));
    params.set("scope", "metrics,summaries");
    router.push(`/analyze?${params.toString()}`);
    setPickerOpen(false);
  };

  return (
    <PageContainer>
      <PageScaffold
        title="Review"
        subtitle="Compare selected sessions with AI in a focused workspace."
        actions={
          hasWorkspace ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setPickerOpen(true)}
            >
              <Plus size={14} />
              New Review
            </Button>
          ) : null
        }
      >
        {hasWorkspace ? (
          <div className="rounded-2xl border border-border/60 bg-card/80 shadow-sm overflow-hidden">
            <CompareWorkspace
              key={conversationId ? `conv:${conversationId}` : `ids:${ids.join(",")}`}
              sessionIds={ids}
              conversationId={conversationId}
              basePath="/analyze"
            />
          </div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-2xl border border-border/60 bg-card/80 shadow-sm p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock3 size={14} className="text-muted-foreground" />
                  <h2 className="text-sm font-semibold tracking-tight">
                    Recent Sessions
                  </h2>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="xs"
                    className="gap-1.5"
                    onClick={() => setPickerOpen(true)}
                  >
                    <Plus size={13} />
                    Pick Sessions
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {recentSessionsLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-xl" />
                  ))
                ) : recentSessions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
                    No indexed sessions yet. Open Sessions and run indexing first.
                  </div>
                ) : (
                  recentSessions.map((session) => (
                    <div
                      key={session.id}
                      className="rounded-xl border border-border/50 bg-muted/20 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-semibold truncate">
                            {session.slug || session.id.slice(0, 12)}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {session.summary || session.first_prompt || "No prompt recorded"}
                          </p>
                        </div>
                        <Button
                          size="xs"
                          onClick={() => handleStartWithSessions([session.id])}
                        >
                          Review
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare size={11} />
                          {session.message_count}
                        </span>
                        <span>{formatCost(session.total_cost)}</span>
                        <span>
                          {formatDistanceToNow(new Date(session.modified_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border/60 bg-card/80 shadow-sm p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <History size={14} className="text-muted-foreground" />
                <h2 className="text-sm font-semibold tracking-tight">
                  Recent Reviews
                </h2>
              </div>
              <AnalysisHistory embedded />
            </section>
          </div>
        )}
      </PageScaffold>

      <AnalyzeSessionPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onConfirm={handleStartWithSessions}
        initialSelectedIds={conversationId ? [] : ids}
        confirmLabel={hasWorkspace ? "Start New Review" : "Start Review"}
        description={
          hasWorkspace
            ? "Pick sessions for a new review workspace. This will replace the current session selection."
            : undefined
        }
      />
    </PageContainer>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      }
    >
      <AnalyzePageContent />
    </Suspense>
  );
}
