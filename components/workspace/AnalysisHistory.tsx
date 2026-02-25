"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAnalysisConversations,
  useDeleteAnalysisConversation,
} from "@/hooks/useAnalysisConversations";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TablePagination } from "@/components/ui/table-pagination";
import { formatCost } from "@/lib/cost/calculator";
import { formatDistanceToNow } from "date-fns";
import { Sparkles, MessageSquare, Trash2, ArrowRight } from "lucide-react";

const PAGE_SIZE = 20;

export function AnalysisHistory({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const deleteConversation = useDeleteAnalysisConversation();

  const { data, isLoading } = useAnalysisConversations({
    status: "active",
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const conversations = data?.conversations || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const content = (
    <div className="space-y-6">
      {/* Header — only in standalone mode */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles size={20} className="text-primary" />
            <div>
              <h1 className="text-lg font-semibold">Review History</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Past session reviews and comparisons
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => router.push("/analyze")}
            className="gap-1.5"
          >
            <ArrowRight size={14} />
            New review
          </Button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        embedded ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No analyses yet. Pick sessions to start your first analysis.
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="rounded-full bg-muted p-4">
              <MessageSquare size={32} className="text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-medium">No reviews yet</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Start from Sessions, or pick specific sessions in Review.
              </p>
            </div>
            <Button
              onClick={() => router.push("/analyze")}
              className="gap-1.5"
            >
              <ArrowRight size={14} />
              Open Review
            </Button>
          </div>
        )
      ) : (
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <table className="table-readable w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30 text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">Title</th>
                <th className="text-left py-2 px-3 font-medium">Sessions</th>
                <th className="text-right py-2 px-3 font-medium">Messages</th>
                <th className="text-right py-2 px-3 font-medium">Cost</th>
                <th className="text-right py-2 px-3 font-medium">Updated</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {conversations.map((conv) => (
                <tr
                  key={conv.id}
                  className="border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer group"
                  onClick={() =>
                    router.push(
                      `/analyze?conversationId=${conv.id}`,
                    )
                  }
                >
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-foreground truncate max-w-[300px]">
                      {conv.title || "Untitled analysis"}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground">
                    {conv.sessionIds.length} session
                    {conv.sessionIds.length !== 1 ? "s" : ""}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                    {conv.messageCount}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-medium text-foreground">
                    {conv.totalCost > 0
                      ? formatCost(conv.totalCost)
                      : "\u2014"}
                  </td>
                  <td className="py-2.5 px-3 text-right text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(conv.updatedAt), {
                      addSuffix: true,
                    })}
                  </td>
                  <td className="px-1 py-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation.mutate(conv.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground/60 hover:text-destructive"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <TablePagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <PageContainer className="max-w-4xl">
      {content}
    </PageContainer>
  );
}
