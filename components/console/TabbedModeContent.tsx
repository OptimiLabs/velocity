"use client";

import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { SettingsPanel } from "./SettingsPanel";
import { SessionInfoBar } from "./SessionInfoBar";
import { EmptyTerminalPrompt } from "./EmptyTerminalPrompt";
import type { ResolvedVisibility } from "@/lib/console/resolve-active-pane";
import type { ConsoleSession, PaneNode, TerminalMeta } from "@/types/console";
import { resolveConsoleCwd } from "@/lib/console/cwd";
import { Settings, X } from "lucide-react";

const terminalImport = () =>
  import("./TerminalPanel").then((m) => ({ default: m.TerminalPanel }));
const TerminalPanel = dynamic(terminalImport, { ssr: false });

function PaneLayer({
  visible,
  borderColor,
  className,
  children,
}: {
  visible: boolean;
  borderColor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("absolute inset-0", className)}
      style={{
        visibility: visible ? "visible" : "hidden",
        zIndex: visible ? 1 : 0,
        borderTop: borderColor ? `2px solid ${borderColor}` : undefined,
      }}
    >
      {children}
    </div>
  );
}

interface TabbedModeContentProps {
  visibility: ResolvedVisibility;
  session: ConsoleSession | null;
  terminalLeaves: Array<PaneNode & { kind: "leaf" }>;
  terminals: Record<string, TerminalMeta>;
  tabbedSidePanel?: "settings";
  wsRef: React.RefObject<WebSocket | null>;
  wsVersion?: number;
  onCreateTerminal: () => void;
  onUpdateTerminalMeta: (termId: string, meta: Partial<TerminalMeta>) => void;
  onSetTabbedSidePanel: (panel?: "settings") => void;
  groupId?: string;
}

export function TabbedModeContent({
  visibility,
  session,
  terminalLeaves,
  terminals,
  tabbedSidePanel,
  wsRef,
  wsVersion,
  onCreateTerminal,
  onUpdateTerminalMeta,
  onSetTabbedSidePanel,
  groupId: _groupId,
}: TabbedModeContentProps) {
  return (
    <>
      {/* Terminal leaves (shell + provider CLI sessions) */}
      {terminalLeaves.map((leaf) => {
        const termId =
          leaf.content.type === "terminal" ? leaf.content.terminalId : "";
        const meta = terminals[termId];
        if (!meta) return null;
        const isActive = visibility.activeTerminalPaneId === leaf.id;
        const activeSidePanel = isActive ? tabbedSidePanel : undefined;
        const showSidePanel = activeSidePanel === "settings";
        return (
          <PaneLayer
            key={termId}
            visible={isActive}
            borderColor={
              isActive ? (meta.tabColor ?? "hsl(var(--primary))") : undefined
            }
            className="flex flex-col"
          >
            <SessionInfoBar
              label={meta.label ?? "Terminal"}
              cwd={resolveConsoleCwd(meta.cwd, session?.cwd)}
              model={meta.model}
              effort={meta.effort}
              activeSidePanel={activeSidePanel}
              onToggleSettings={() =>
                onSetTabbedSidePanel(
                  activeSidePanel === "settings" ? undefined : "settings",
                )
              }
              onRename={(label) => onUpdateTerminalMeta(termId, { label })}
            />
            <div className="flex-1 overflow-hidden relative">
              <div className="absolute inset-0 flex min-w-0">
                <div className="relative flex-1 min-w-0">
                  <div className="absolute inset-0">
                    <TerminalPanel
                      terminalId={termId}
                      cwd={resolveConsoleCwd(meta.cwd, session?.cwd)}
                      wsRef={wsRef}
                      wsVersion={wsVersion}
                      command={meta.command}
                      args={meta.args}
                      isActive={isActive}
                    />
                  </div>
                </div>
                {showSidePanel && (
                  <aside className="w-[360px] max-w-[48vw] shrink-0 border-l border-border/60 bg-card/70 backdrop-blur-sm flex flex-col">
                    <div className="h-8 px-3 border-b border-border/50 flex items-center gap-2 shrink-0">
                      <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground">Settings</span>
                      <button
                        type="button"
                        aria-label="Close panel"
                        className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                        onClick={() => onSetTabbedSidePanel(undefined)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-hidden min-h-0">
                      <SettingsPanel wsRef={wsRef} terminalId={termId} />
                    </div>
                  </aside>
                )}
              </div>
            </div>
          </PaneLayer>
        );
      })}

      {/* Empty terminal state */}
      {visibility.kind === "empty-terminal" && (
        <EmptyTerminalPrompt onCreateTerminal={onCreateTerminal} />
      )}
    </>
  );
}
