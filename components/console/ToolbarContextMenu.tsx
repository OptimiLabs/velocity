"use client";

import { useState, useEffect } from "react";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { TerminalMeta } from "@/types/console";

export interface ContextMenuState {
  x: number;
  y: number;
  termId: string;
}

interface ToolbarContextMenuProps {
  contextMenu: ContextMenuState | null;
  terminals: Record<string, TerminalMeta>;
  onDismiss: () => void;
  onRename: (termId: string, currentLabel: string) => void;
  onClose: (termId: string) => void;
  onCloseOthers: (termId: string) => void;
}

const PRESET_COLORS = [
  { label: "Red", color: "#ef4444" },
  { label: "Orange", color: "#f97316" },
  { label: "Yellow", color: "#eab308" },
  { label: "Green", color: "#22c55e" },
  { label: "Blue", color: "#3b82f6" },
  { label: "Purple", color: "#a855f7" },
] as const;

export function ToolbarContextMenu({
  contextMenu,
  terminals,
  onDismiss,
  onRename,
  onClose,
  onCloseOthers,
}: ToolbarContextMenuProps) {
  const [customColorDialogOpen, setCustomColorDialogOpen] = useState(false);
  const [customColorValue, setCustomColorValue] = useState("#");
  const [customColorTermId, setCustomColorTermId] = useState<string | null>(
    null,
  );

  // Dismiss on click or escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => onDismiss();
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [contextMenu, onDismiss]);

  if (!contextMenu && !customColorDialogOpen) return null;

  const termId = contextMenu?.termId ?? "";
  const meta = termId ? terminals[termId] : undefined;

  return (
    <>
      {/* Right-click context menu for terminal tabs */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-card border border-border rounded-md shadow-lg py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
            onClick={() => {
              onRename(contextMenu.termId, meta?.label || "");
              onDismiss();
            }}
          >
            Rename Terminal
          </button>
          {/* Tab color submenu */}
          <div className="relative group/color">
            <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors flex items-center justify-between">
              Set Tab Color
              <span className="text-muted-foreground ml-2">&#9654;</span>
            </button>
            <div className="invisible group-hover/color:visible absolute left-full top-0 bg-card border border-border rounded-md shadow-lg py-1 min-w-[140px]">
              {PRESET_COLORS.map(({ label, color }) => (
                <button
                  key={color}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2"
                  onClick={() => {
                    useConsoleLayoutStore
                      .getState()
                      .updateTerminalMeta(contextMenu.termId, {
                        tabColor: color,
                      });
                    onDismiss();
                  }}
                >
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ backgroundColor: color }}
                  />
                  {label}
                </button>
              ))}
              <div className="border-t border-border my-1" />
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                onClick={() => {
                  setCustomColorValue("#");
                  setCustomColorTermId(contextMenu.termId);
                  setCustomColorDialogOpen(true);
                  onDismiss();
                }}
              >
                Custom...
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                onClick={() => {
                  useConsoleLayoutStore
                    .getState()
                    .updateTerminalMeta(contextMenu.termId, {
                      tabColor: undefined,
                    });
                  onDismiss();
                }}
              >
                Clear
              </button>
            </div>
          </div>
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
            onClick={() => {
              useConsoleLayoutStore.getState().addTerminal(
                {
                  cwd: terminals[contextMenu.termId]?.cwd || "~",
                  sessionId: terminals[contextMenu.termId]?.sessionId,
                },
                "h",
              );
              onDismiss();
            }}
          >
            Split Right{" "}
            <span className="float-right text-muted-foreground">&#8984;D</span>
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
            onClick={() => {
              useConsoleLayoutStore.getState().addTerminal(
                {
                  cwd: terminals[contextMenu.termId]?.cwd || "~",
                  sessionId: terminals[contextMenu.termId]?.sessionId,
                },
                "v",
              );
              onDismiss();
            }}
          >
            Split Down{" "}
            <span className="float-right text-muted-foreground">
              &#8984;&#8679;D
            </span>
          </button>
          <div className="border-t border-border my-1" />
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
            onClick={() => {
              onClose(contextMenu.termId);
              onDismiss();
            }}
          >
            Close Terminal{" "}
            <span className="float-right text-muted-foreground">&#8984;W</span>
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
            onClick={() => {
              onCloseOthers(contextMenu.termId);
              onDismiss();
            }}
          >
            Close Other Terminals
          </button>
          <div className="border-t border-border my-1" />
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
            onClick={() => {
              navigator.clipboard.writeText(
                terminals[contextMenu.termId]?.cwd || "",
              );
              onDismiss();
            }}
          >
            Copy CWD to Clipboard
          </button>
        </div>
      )}

      {/* Custom Color Dialog */}
      <Dialog
        open={customColorDialogOpen}
        onOpenChange={setCustomColorDialogOpen}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Custom Tab Color</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            type="text"
            placeholder="#ff6600"
            value={customColorValue}
            onChange={(e) => setCustomColorValue(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                /^#[0-9a-fA-F]{3,8}$/.test(customColorValue) &&
                customColorTermId
              ) {
                useConsoleLayoutStore
                  .getState()
                  .updateTerminalMeta(customColorTermId, {
                    tabColor: customColorValue,
                  });
                setCustomColorDialogOpen(false);
              }
            }}
            className="w-full h-9 text-sm px-3 bg-card border border-border rounded-md text-foreground font-mono outline-none focus:ring-1 focus:ring-primary"
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCustomColorDialogOpen(false)}
              className="px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                !/^#[0-9a-fA-F]{3,8}$/.test(customColorValue) ||
                !customColorTermId
              }
              onClick={() => {
                if (customColorTermId) {
                  useConsoleLayoutStore
                    .getState()
                    .updateTerminalMeta(customColorTermId, {
                      tabColor: customColorValue,
                    });
                }
                setCustomColorDialogOpen(false);
              }}
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Apply
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
