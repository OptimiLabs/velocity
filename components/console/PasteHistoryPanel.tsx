"use client";

import { useState, useEffect, useRef } from "react";
import { Clipboard, X } from "lucide-react";

interface PasteEntry {
  text: string;
  timestamp: number;
}

const MAX_ENTRIES = 20;
const pasteHistory: PasteEntry[] = [];

/** Track a paste operation. Called from TerminalPanel or useKeyboardShortcuts. */
export function recordPaste(text: string) {
  // Don't store empty or duplicate last
  if (!text.trim()) return;
  if (pasteHistory.length > 0 && pasteHistory[0].text === text) return;
  pasteHistory.unshift({ text, timestamp: Date.now() });
  if (pasteHistory.length > MAX_ENTRIES) pasteHistory.pop();
}

export function getPasteHistory(): PasteEntry[] {
  return [...pasteHistory];
}

interface PasteHistoryPanelProps {
  visible: boolean;
  onClose: () => void;
  onPaste: (text: string) => void;
}

export function PasteHistoryPanel({
  visible,
  onClose,
  onPaste,
}: PasteHistoryPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<PasteEntry[]>([]);

  useEffect(() => {
    if (visible) {
      setEntries(getPasteHistory());
    }
  }, [visible]);

  // Close on Escape
  useEffect(() => {
    if (!visible) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      className="absolute top-8 right-2 z-50 w-72 max-h-80 bg-card border border-border rounded-lg shadow-lg overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-1.5">
          <Clipboard className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs font-medium">Paste History</span>
        </div>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-muted/50">
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>
      <div className="overflow-y-auto max-h-64">
        {entries.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground/50">
            No paste history yet
          </div>
        ) : (
          entries.map((entry, i) => (
            <button
              key={`${entry.timestamp}-${i}`}
              onClick={() => {
                onPaste(entry.text);
                onClose();
              }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted/30 transition-colors border-b border-border/20 last:border-0"
            >
              <div className="font-mono text-foreground/80 truncate">
                {entry.text.slice(0, 50)}
                {entry.text.length > 50 && "..."}
              </div>
              <div className="text-[10px] text-muted-foreground/50 mt-0.5">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
