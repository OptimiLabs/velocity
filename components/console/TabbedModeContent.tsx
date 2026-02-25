"use client";

import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { SettingsPanel } from "./SettingsPanel";
import { ContextPanel } from "./ContextPanel";
import { SessionInfoBar } from "./SessionInfoBar";
import { EmptyTerminalPrompt } from "./EmptyTerminalPrompt";
import type { ResolvedVisibility } from "@/lib/console/resolve-active-pane";
import type { ConsoleSession, PaneNode, TerminalMeta } from "@/types/console";

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
  settingsLeafExists: boolean;
  contextLeafExists: boolean;
  wsRef: React.RefObject<WebSocket | null>;
  wsVersion?: number;
  onCreateSession?: (opts: {
    cwd: string;
    label?: string;
    prompt?: string;
    model?: string;
    effort?: "low" | "medium" | "high";
    env?: Record<string, string>;
    skipPermissions?: boolean;
    groupId?: string;
  }) => void;
  onCreateTerminal: () => void;
  onUpdateTerminalMeta: (termId: string, meta: Partial<TerminalMeta>) => void;
  groupId?: string;
}

export function TabbedModeContent({
  visibility,
  session,
  terminalLeaves,
  terminals,
  settingsLeafExists,
  contextLeafExists,
  wsRef,
  wsVersion,
  onCreateSession: _onCreateSession,
  onCreateTerminal,
  onUpdateTerminalMeta,
  groupId: _groupId,
}: TabbedModeContentProps) {
  return (
    <>
      {/* Terminal leaves (both shell and Claude sessions) */}
      {terminalLeaves.map((leaf) => {
        const termId =
          leaf.content.type === "terminal" ? leaf.content.terminalId : "";
        const meta = terminals[termId];
        if (!meta) return null;
        const isActive = visibility.activeTerminalPaneId === leaf.id;
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
              cwd={meta.cwd || session?.cwd || "~"}
              model={meta.model}
              effort={meta.effort}
              onRename={(label) => onUpdateTerminalMeta(termId, { label })}
            />
            <div className="flex-1 overflow-hidden relative">
              <div className="absolute inset-0">
                <TerminalPanel
                  terminalId={termId}
                  cwd={meta.cwd || session?.cwd || "~"}
                  wsRef={wsRef}
                  wsVersion={wsVersion}
                  command={meta.command}
                  args={meta.args}
                  isActive={isActive}
                />
              </div>
            </div>
          </PaneLayer>
        );
      })}

      {/* Empty terminal state */}
      {visibility.kind === "empty-terminal" && (
        <EmptyTerminalPrompt onCreateTerminal={onCreateTerminal} />
      )}

      {/* Settings panel */}
      {settingsLeafExists && (
        <PaneLayer visible={visibility.kind === "settings"}>
          <SettingsPanel wsRef={wsRef} />
        </PaneLayer>
      )}

      {/* Context panel */}
      {contextLeafExists && (
        <PaneLayer visible={visibility.kind === "context"}>
          <ContextPanel session={session} />
        </PaneLayer>
      )}
    </>
  );
}
