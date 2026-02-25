"use client";

import { Terminal as TerminalIcon } from "lucide-react";

export function EmptyTerminalPrompt({
  onCreateTerminal,
}: {
  onCreateTerminal: () => void;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <button
        onClick={onCreateTerminal}
        className="flex flex-col items-center gap-3 px-8 py-6 rounded-lg border border-dashed border-border/50 hover:border-primary/30 hover:bg-muted/20 transition-colors group"
      >
        <TerminalIcon className="w-8 h-8 text-muted-foreground/60 group-hover:text-primary/50 transition-colors" />
        <div className="text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
          Open a terminal
        </div>
        <kbd className="text-meta text-text-quaternary bg-muted/20 px-1.5 py-0.5 rounded">
          ⌘T
        </kbd>
      </button>
    </div>
  );
}
