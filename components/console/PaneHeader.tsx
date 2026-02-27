"use client";

import { useState, useCallback, type DragEvent } from "react";
import {
  Terminal,
  Settings,
  SplitSquareHorizontal,
  SplitSquareVertical,
  X,
  GripVertical,
} from "lucide-react";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { resolveConsoleCwd } from "@/lib/console/cwd";
import { toast } from "sonner";
import type { PaneNode, PaneContent, TerminalMeta } from "@/types/console";

function shortenPath(p: string): string {
  if (!p) return "";
  const cleaned = p.replace(/^~\//, "~/");
  const segments = cleaned.split("/");
  if (segments.length <= 3) return cleaned;
  return "…/" + segments.slice(-2).join("/");
}

interface PaneHeaderProps {
  node: PaneNode & { kind: "leaf" };
  onClose: () => void;
  isOnly?: boolean;
  /** Group-specific terminal metadata — avoids reading wrong group from store */
  terminals?: Record<string, TerminalMeta>;
}

function labelFor(
  content: PaneContent,
  terminals?: Record<string, TerminalMeta>,
): {
  icon: typeof Terminal;
  label: string;
  cwd?: string;
} {
  switch (content.type) {
    case "terminal": {
      // Use provided group terminals, fall back to store for backwards compat
      const meta = terminals?.[content.terminalId]
        ?? useConsoleLayoutStore.getState().terminals[content.terminalId];
      return {
        icon: Terminal,
        label: meta?.label ?? content.terminalId.replace(/^term-/, "Terminal "),
        cwd: meta?.cwd,
      };
    }
    case "settings":
      return { icon: Settings, label: "Settings" };
    case "context":
      return { icon: Settings, label: "Settings" };
    case "empty":
      return { icon: Terminal, label: "New Terminal" };
    default: {
      const _exhaustive: never = content;
      return { icon: Terminal, label: "Unknown" };
    }
  }
}

// Module-level drag state so all PaneHeaders can coordinate
let draggedPaneId: string | null = null;

export function getDraggedPaneId() {
  return draggedPaneId;
}

export function PaneHeader({
  node,
  onClose,
  isOnly,
  terminals,
}: PaneHeaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const { icon: Icon, label, cwd } = labelFor(node.content, terminals);
  const setIsDraggingPane = useConsoleLayoutStore((s) => s.setIsDraggingPane);
  const updateTerminalMeta = useConsoleLayoutStore((s) => s.updateTerminalMeta);
  const storeTerminals = useConsoleLayoutStore((s) => s.terminals);

  const terminalId =
    node.content.type === "terminal" ? node.content.terminalId : null;
  const terminalMeta = terminalId
    ? terminals?.[terminalId] ?? storeTerminals[terminalId]
    : undefined;
  const sidePanel = terminalMeta?.sidePanel;

  const getSplitSource = () => {
    const store = useConsoleLayoutStore.getState();
    const sourceMeta =
      node.content.type === "terminal"
        ? terminals?.[node.content.terminalId] ??
          store.terminals[node.content.terminalId]
        : undefined;
    const sessionId = sourceMeta?.sessionId ?? store.activeSessionId;
    return {
      sessionId,
      cwd: resolveConsoleCwd(sourceMeta?.cwd),
    };
  };

  const handleSplitH = () => {
    const store = useConsoleLayoutStore.getState();
    const source = getSplitSource();
    if (!source.sessionId) {
      toast.error("Select or create a session first.");
      return;
    }
    store.addTerminal(
      {
        cwd: source.cwd,
        sessionId: source.sessionId,
      },
      "h",
    );
  };

  const handleSplitV = () => {
    const store = useConsoleLayoutStore.getState();
    const source = getSplitSource();
    if (!source.sessionId) {
      toast.error("Select or create a session first.");
      return;
    }
    store.addTerminal(
      {
        cwd: source.cwd,
        sessionId: source.sessionId,
      },
      "v",
    );
  };

  const handleDragStart = useCallback(
    (e: DragEvent) => {
      draggedPaneId = node.id;
      setIsDragging(true);
      setIsDraggingPane(true);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", node.id);
    },
    [node.id, setIsDraggingPane],
  );

  const handleDragEnd = useCallback(() => {
    draggedPaneId = null;
    setIsDragging(false);
    setIsDraggingPane(false);
  }, [setIsDraggingPane]);

  const toggleSettingsPanel = () => {
    if (!terminalId) return;
    updateTerminalMeta(terminalId, {
      sidePanel: sidePanel === "settings" ? undefined : "settings",
    });
  };

  return (
    <div
      className={`flex items-center h-6 px-1.5 bg-card/70 border-b border-border/50 shrink-0 gap-0.5 ${
        isDragging ? "opacity-50" : ""
      }`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <GripVertical className="w-3 h-3 text-text-quaternary cursor-grab active:cursor-grabbing shrink-0" />
      <Icon className="w-3 h-3 text-muted-foreground" />
      <span
        className={`text-meta text-muted-foreground truncate ml-0.5 ${
          label === "Settings" ? "font-semibold" : "font-medium"
        }`}
      >
        {label}
      </span>
      {cwd && (
        <span className="text-[9px] text-muted-foreground/60 font-normal truncate">
          {shortenPath(cwd)}
        </span>
      )}

      <div className="flex-1" />

      {terminalId && (
        <>
          <button
            onClick={toggleSettingsPanel}
            className={`p-0.5 rounded transition-colors ${
              sidePanel === "settings"
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-primary hover:bg-primary/20"
            }`}
            title="Toggle settings panel"
          >
            <Settings className="w-3 h-3" />
          </button>
        </>
      )}
      <button
        onClick={handleSplitH}
        className="p-0.5 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
        title="Split right (⌘D)"
      >
        <SplitSquareHorizontal className="w-3 h-3" />
      </button>
      <button
        onClick={handleSplitV}
        className="p-0.5 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
        title="Split down (⌘⇧D)"
      >
        <SplitSquareVertical className="w-3 h-3" />
      </button>
      {!isOnly && (
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
          title="Close pane"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
