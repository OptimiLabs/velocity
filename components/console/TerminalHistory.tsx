"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Trash2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  listArchivedScrollbacks,
  loadArchivedScrollback,
  deleteArchivedScrollback,
} from "@/lib/console/terminal-db";
import {
  DEFAULT_APPEARANCE,
  TERMINAL_THEMES,
} from "@/lib/console/terminal-settings";
import "@xterm/xterm/css/xterm.css";

interface ArchivedEntry {
  terminalId: string;
  savedAt: number;
  sessionId?: string;
}

export interface TerminalHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TerminalHistory({ open, onOpenChange }: TerminalHistoryProps) {
  const [entries, setEntries] = useState<ArchivedEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scrollbackData, setScrollbackData] = useState<string | null>(null);

  const xtermContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Load list of archives when dialog opens
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setScrollbackData(null);
      setSearchQuery("");
      return;
    }
    loadEntries();
  }, [open]);

  const loadEntries = useCallback(async () => {
    const list = await listArchivedScrollbacks();
    // Sort newest first
    list.sort((a, b) => b.savedAt - a.savedAt);
    setEntries(list);
  }, []);

  // Load scrollback data when an entry is selected
  useEffect(() => {
    if (!selectedId) {
      setScrollbackData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const data = await loadArchivedScrollback(selectedId);
      if (!cancelled) {
        setScrollbackData(data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Create / destroy xterm instance when scrollback data is available
  useEffect(() => {
    if (!scrollbackData || !xtermContainerRef.current) return;

    const theme =
      TERMINAL_THEMES[DEFAULT_APPEARANCE.theme ?? "one-dark"]?.theme ??
      TERMINAL_THEMES["one-dark"].theme;

    const term = new Terminal({
      disableStdin: true,
      cursorBlink: false,
      fontSize: DEFAULT_APPEARANCE.fontSize,
      fontFamily: DEFAULT_APPEARANCE.fontFamily,
      lineHeight: DEFAULT_APPEARANCE.lineHeight,
      theme,
      scrollback: 50000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(xtermContainerRef.current);

    // Small delay to let DOM settle before fitting
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {
        // container may not be visible yet
      }
    });

    term.write(scrollbackData);

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // ignore
      }
    });
    if (xtermContainerRef.current) {
      resizeObserver.observe(xtermContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [scrollbackData]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, terminalId: string) => {
      e.stopPropagation();
      await deleteArchivedScrollback(terminalId);
      if (selectedId === terminalId) {
        setSelectedId(null);
        setScrollbackData(null);
      }
      await loadEntries();
    },
    [selectedId, loadEntries],
  );

  const handleToggleEntry = useCallback((terminalId: string) => {
    setSelectedId((prev) => (prev === terminalId ? null : terminalId));
  }, []);

  const truncateId = (id: string, maxLen = 16) =>
    id.length > maxLen ? id.slice(0, maxLen) + "\u2026" : id;

  const filteredEntries = entries.filter((entry) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      entry.terminalId.toLowerCase().includes(q) ||
      (entry.sessionId && entry.sessionId.toLowerCase().includes(q))
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Terminal History</DialogTitle>
          <DialogDescription className="sr-only">
            Browse and view archived terminal sessions
          </DialogDescription>
        </DialogHeader>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by terminal or session ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-border bg-zinc-900 text-zinc-300 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Entry list */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
          {filteredEntries.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground/50">
              No archived terminals
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const isSelected = selectedId === entry.terminalId;
              return (
                <div key={entry.terminalId}>
                  <button
                    onClick={() => handleToggleEntry(entry.terminalId)}
                    className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors flex items-center justify-between gap-2 ${
                      isSelected
                        ? "bg-zinc-800 text-zinc-100"
                        : "hover:bg-zinc-800/50 text-zinc-300"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="font-mono text-xs truncate">
                        {truncateId(entry.terminalId)}
                      </span>
                      {entry.sessionId && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          Session: {truncateId(entry.sessionId, 20)}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground/60">
                        {new Date(entry.savedAt).toLocaleString()}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, entry.terminalId)}
                      className="shrink-0 p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                      title="Delete archive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </button>

                  {/* Expanded xterm viewer */}
                  {isSelected && (
                    <div className="mt-1 mb-2 mx-1 rounded-md overflow-hidden border border-border/50 bg-zinc-950">
                      {scrollbackData === null ? (
                        <div className="flex items-center justify-center py-8 text-xs text-muted-foreground/50">
                          Loading scrollback...
                        </div>
                      ) : (
                        <div
                          ref={xtermContainerRef}
                          className="w-full h-[350px]"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
