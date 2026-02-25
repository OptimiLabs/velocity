"use client";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GitBranch,
  MessageSquare,
  Zap,
  Trash2,
} from "lucide-react";
import { formatCost, formatTokens, getTotalTokens } from "@/lib/cost/calculator";
import { useDeleteSession } from "@/hooks/useSessions";
import { useConfirm } from "@/hooks/useConfirm";
import { useLiveStore } from "@/stores/liveStore";
import type { Session } from "@/types/session";
import type { ConfigProvider } from "@/types/provider";
import { getSessionProvider } from "@/lib/providers/session-registry";

interface SessionCardProps {
  session: Session;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function SessionCard({ session, selected, onToggleSelect }: SessionCardProps) {
  const timeAgo = formatDistanceToNow(new Date(session.modified_at), {
    addSuffix: true,
  });
  const absoluteTime = format(
    new Date(session.modified_at),
    "MMM d, yyyy h:mm a",
  );
  const router = useRouter();
  const { confirm } = useConfirm();
  const deleteSession = useDeleteSession();
  const isLive = useLiveStore((s) => s.sessions.has(session.id));

  return (
    <Link href={`/sessions/${session.id}`} className="h-full">
      <Card className={`card-hover-glow cursor-pointer group bg-card relative h-full ${selected ? "ring-2 ring-primary/40" : ""}`}>
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={!!selected}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect(session.id);
            }}
            onChange={() => {}}
            className={`absolute top-2 left-2 z-10 h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          />
        )}
        <CardHeader className="p-4 pb-2">
          <div className="flex justify-between items-start gap-2">
            <span className="font-mono text-xs text-muted-foreground truncate">
              {session.slug || session.id.slice(0, 12)}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {isLive && (
                <Badge
                  variant="default"
                  className="text-meta bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
                  running
                </Badge>
              )}
              {session.provider && session.provider !== "claude" && (() => {
                const def = getSessionProvider(session.provider as ConfigProvider);
                if (!def) return null;
                return (
                  <Badge
                    variant="secondary"
                    className={`text-meta ${def.badgeClasses.bg} ${def.badgeClasses.text} ${def.badgeClasses.border}`}
                  >
                    {def.label}
                  </Badge>
                );
              })()}
              {session.session_role === "subagent" && (
                <Badge
                  variant="secondary"
                  className={`text-meta ${session.parent_session_id ? "cursor-pointer hover:bg-secondary" : ""}`}
                  onClick={
                    session.parent_session_id
                      ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          router.push(`/sessions/${session.parent_session_id}`);
                        }
                      : undefined
                  }
                >
                  <GitBranch size={10} className="mr-0.5" />
                  {session.subagent_type || "subagent"}
                </Badge>
              )}
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const ok = await confirm({
                    title: "Hard delete this session?",
                    description:
                      "This permanently deletes the session from the index and removes its JSONL log from disk. This cannot be undone.",
                    confirmLabel: "Hard Delete",
                    variant: "destructive",
                  });
                  if (!ok) return;
                  deleteSession.mutate(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground/60 hover:text-destructive"
                title="Hard delete session (removes file from disk)"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 flex-1 flex flex-col">
          <p className="line-clamp-2 text-sm mb-2 text-foreground/80 leading-relaxed">
            {session.summary || session.first_prompt || "No prompt recorded"}
          </p>
          {(() => {
            const tags: string[] = (() => {
              try {
                return JSON.parse(session.tags || "[]");
              } catch {
                return [];
              }
            })();
            return tags.length > 0 ? (
              <div className="flex flex-wrap gap-1 mb-2">
                {tags.slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    className="text-meta px-1.5 py-0.5 rounded-full bg-primary/8 text-primary/80"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null;
          })()}
          <div className="border-t border-border/30 pt-2.5 mt-auto space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {formatCost(session.total_cost)}
              </span>
              <span className="text-xs text-muted-foreground/60 tabular-nums" title={absoluteTime}>
                {timeAgo}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MessageSquare size={12} />
                {session.message_count} msgs
              </span>
              <span
                className="flex items-center gap-1"
                title={`Input: ${formatTokens(session.input_tokens)} · Output: ${formatTokens(session.output_tokens)} · Cache read: ${formatTokens(session.cache_read_tokens)} · Cache write: ${formatTokens(session.cache_write_tokens)}`}
              >
                <Zap size={12} />
                {formatTokens(getTotalTokens(session))} tok
              </span>
              {session.git_branch && (
                <span className="flex items-center gap-1 truncate ml-auto">
                  <GitBranch size={12} />
                  {session.git_branch}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
