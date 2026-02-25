"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Archive, RotateCcw, Terminal, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PersistedConsoleSession } from "@/lib/db/console-sessions";

interface ArchiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (id: string) => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ArchiveModal({
  open,
  onOpenChange,
  onRestore,
}: ArchiveModalProps) {
  const [sessions, setSessions] = useState<PersistedConsoleSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchArchived = useCallback(() => {
    setLoading(true);
    fetch("/api/console-sessions?filter=archived")
      .then((r) => r.json())
      .then((data: PersistedConsoleSession[]) => {
        setSessions(data);
        setLoading(false);
      })
      .catch(() => {
        setSessions([]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (open) fetchArchived();
  }, [open, fetchArchived]);

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    onRestore(id);
    // Remove from local list
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setRestoringId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Archive size={16} />
            Archived Sessions
          </DialogTitle>
          <DialogDescription>
            Browse and restore previously archived console sessions.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-8 text-center">
              <Archive
                size={24}
                className="mx-auto text-muted-foreground/40 mb-2"
              />
              <div className="text-sm text-muted-foreground">
                No archived sessions
              </div>
              <div className="text-xs text-muted-foreground/60 mt-1">
                Idle sessions will be auto-archived based on your settings.
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map((session) => {
                const termCount = session.archivedTerminals?.length ?? 0;
                return (
                  <div
                    key={session.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/50",
                      "hover:bg-muted/30 transition-colors",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {session.label}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                          <FolderOpen size={9} />
                          {session.cwd
                            .split("/")
                            .filter(Boolean)
                            .slice(-2)
                            .join("/")}
                        </span>
                        {session.archivedAt && (
                          <span className="text-[10px] text-muted-foreground">
                            archived {formatDate(session.archivedAt)}
                          </span>
                        )}
                        {termCount > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Terminal size={8} />
                            {termCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 shrink-0"
                      disabled={restoringId === session.id}
                      onClick={() => handleRestore(session.id)}
                    >
                      <RotateCcw size={11} />
                      Restore
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
