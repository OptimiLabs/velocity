"use client";

import { useCallback } from "react";
import dynamic from "next/dynamic";
import type { ConsoleSession } from "@/types/console";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { useConsole } from "@/components/providers/ConsoleProvider";
import { SessionInfoBar } from "./SessionInfoBar";

// Dynamic import for xterm (needs client-only due to CSS import)
const TerminalPanel = dynamic(
  () => import("./TerminalPanel").then((m) => ({ default: m.TerminalPanel })),
  { ssr: false },
);

interface ClaudePanelProps {
  session: ConsoleSession | null;
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
  groupId?: string;
}

export function ClaudePanel({
  session,
  wsRef,
  wsVersion,
  onCreateSession: _onCreateSession,
  groupId: _groupId,
}: ClaudePanelProps) {
  const { sendModelChange, restartSession, renameSession } =
    useConsole();

  const terminalId = session?.terminalId;

  // Get terminal metadata reactively (for pendingPrompt, command, args)
  const meta = useConsoleLayoutStore((s) => {
    if (!terminalId) return undefined;
    for (const group of Object.values(s.groups)) {
      if (group.terminals[terminalId]) {
        return group.terminals[terminalId];
      }
    }
    return undefined;
  });

  const handlePromptConsumed = useCallback(() => {
    if (terminalId) {
      useConsoleLayoutStore.getState().consumePendingPrompt(terminalId);
    }
  }, [terminalId]);

  if (!session) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm">
        <div>No session selected.</div>
      </div>
    );
  }

  if (session.kind === "shell") {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm">
        <div>Shell session selected.</div>
      </div>
    );
  }

  if (!terminalId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm gap-3">
        <div>Session terminal unavailable.</div>
        <button
          onClick={() => restartSession(session.id)}
          className="px-3 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 border border-primary/20 text-xs font-medium text-primary transition-colors"
        >
          Restart Session
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SessionInfoBar
        label={meta?.label ?? session.label}
        cwd={meta?.cwd || session.cwd}
        model={session.model}
        effort={session.effort}
        claudeSessionId={session.claudeSessionId}
        onModelChange={(model) => sendModelChange(session.id, model)}
        onRestart={(opts) => restartSession(session.id, opts)}
        onRename={(label) => renameSession(session.id, label)}
      />
      <div className="flex-1 overflow-hidden">
        <TerminalPanel
          key={terminalId}
          terminalId={terminalId}
          cwd={meta?.cwd || session.cwd}
          wsRef={wsRef}
          wsVersion={wsVersion}
          envOverrides={meta?.envOverrides}
          command={meta?.command}
          args={meta?.args}
          pendingPrompt={meta?.pendingPrompt}
          onPromptConsumed={handlePromptConsumed}
        />
      </div>
    </div>
  );
}
