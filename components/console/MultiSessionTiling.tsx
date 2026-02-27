"use client";

import { useMemo } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { ClaudePanel } from "./ClaudePanel";
import { PinOff } from "lucide-react";
import type { ConsoleSession } from "@/types/console";

interface MultiSessionTilingProps {
  sessions: Map<string, ConsoleSession>;
  pinnedIds: string[];
  wsRef: React.RefObject<WebSocket | null>;
  wsVersion?: number;
  renameSession: (sessionId: string, label: string) => void;
  onUnpin: (sessionId: string) => void;
}

function SessionPane({
  session,
  wsRef,
  wsVersion,
  onUnpin,
}: {
  session: ConsoleSession;
  wsRef: React.RefObject<WebSocket | null>;
  wsVersion?: number;
  onUnpin: () => void;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden border border-border/30 rounded-sm">
      {/* Compact pane header with unpin */}
      <div className="flex items-center h-6 px-1.5 bg-card/50 border-b border-border/30 shrink-0 gap-0.5">
        <div
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            session.status === "active"
              ? "bg-emerald-400"
              : "bg-muted-foreground"
          }`}
        />
        <span className="text-sm font-medium text-muted-foreground/80 truncate flex-1">
          {session.label}
        </span>
        <button
          onClick={onUnpin}
          className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground/60 hover:text-destructive transition-colors"
          title="Unpin session"
        >
          <PinOff className="w-3 h-3" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <ClaudePanel session={session} wsRef={wsRef} wsVersion={wsVersion} />
      </div>
    </div>
  );
}

export function MultiSessionTiling({
  sessions,
  pinnedIds,
  wsRef,
  wsVersion,
  onUnpin,
}: MultiSessionTilingProps) {
  // Filter to only sessions that exist
  const validPinned = useMemo(
    () => pinnedIds.filter((id) => sessions.has(id)),
    [pinnedIds, sessions],
  );

  if (validPinned.length === 0) return null;

  if (validPinned.length === 1) {
    const session = sessions.get(validPinned[0])!;
    return (
      <div className="h-full p-0.5">
        <SessionPane
          session={session}
          wsRef={wsRef}
          wsVersion={wsVersion}
          onUnpin={() => onUnpin(session.id)}
        />
      </div>
    );
  }

  return (
    <div className="h-full p-0.5">
      <BalancedSessionSplit
        idPrefix="multi-session-root"
        sessionIds={validPinned}
        sessions={sessions}
        wsRef={wsRef}
        wsVersion={wsVersion}
        onUnpin={onUnpin}
      />
    </div>
  );
}

function BalancedSessionSplit({
  idPrefix,
  sessionIds,
  sessions,
  wsRef,
  wsVersion,
  onUnpin,
}: {
  idPrefix: string;
  sessionIds: string[];
  sessions: Map<string, ConsoleSession>;
  wsRef: React.RefObject<WebSocket | null>;
  wsVersion?: number;
  onUnpin: (sessionId: string) => void;
}) {
  if (sessionIds.length === 1) {
    const session = sessions.get(sessionIds[0])!;
    return (
      <SessionPane
        session={session}
        wsRef={wsRef}
        wsVersion={wsVersion}
        onUnpin={() => onUnpin(sessionIds[0])}
      />
    );
  }

  const mid = Math.ceil(sessionIds.length / 2);
  const first = sessionIds.slice(0, mid);
  const second = sessionIds.slice(mid);
  const isHorizontal = sessionIds.length % 2 === 0;
  const orientation = isHorizontal ? "horizontal" : "vertical";
  const firstSize = (first.length / sessionIds.length) * 100;
  const separatorClass = isHorizontal
    ? "w-1 bg-border/30 hover:bg-primary/30 transition-colors cursor-col-resize"
    : "h-1 bg-border/30 hover:bg-primary/30 transition-colors cursor-row-resize";

  return (
    <Group orientation={orientation} id={`${idPrefix}-${sessionIds[0]}`}>
      <Panel defaultSize={firstSize} minSize={15}>
        <BalancedSessionSplit
          idPrefix={`${idPrefix}-a`}
          sessionIds={first}
          sessions={sessions}
          wsRef={wsRef}
          wsVersion={wsVersion}
          onUnpin={onUnpin}
        />
      </Panel>
      <Separator className={separatorClass} />
      <Panel defaultSize={100 - firstSize} minSize={15}>
        <BalancedSessionSplit
          idPrefix={`${idPrefix}-b`}
          sessionIds={second}
          sessions={sessions}
          wsRef={wsRef}
          wsVersion={wsVersion}
          onUnpin={onUnpin}
        />
      </Panel>
    </Group>
  );
}
