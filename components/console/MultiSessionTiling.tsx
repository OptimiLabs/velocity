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

  // 2+ sessions: first on left (50%), rest stacked vertically on right (50%)
  const [firstId, ...restIds] = validPinned;
  const firstSession = sessions.get(firstId)!;

  return (
    <div className="h-full p-0.5">
      <Group orientation="horizontal" id="multi-session-root">
        <Panel defaultSize={50} minSize={20}>
          <SessionPane
            session={firstSession}
            wsRef={wsRef}
            wsVersion={wsVersion}
            onUnpin={() => onUnpin(firstId)}
          />
        </Panel>
        <Separator className="w-1 bg-border/30 hover:bg-primary/30 transition-colors cursor-col-resize" />
        <Panel defaultSize={50} minSize={20}>
          {restIds.length === 1 ? (
            <SessionPane
              session={sessions.get(restIds[0])!}
              wsRef={wsRef}
              wsVersion={wsVersion}
              onUnpin={() => onUnpin(restIds[0])}
            />
          ) : (
            <VerticalStack
              sessionIds={restIds}
              sessions={sessions}
              wsRef={wsRef}
              wsVersion={wsVersion}
              onUnpin={onUnpin}
            />
          )}
        </Panel>
      </Group>
    </div>
  );
}

function VerticalStack({
  sessionIds,
  sessions,
  wsRef,
  wsVersion,
  onUnpin,
}: {
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

  // Split into two halves recursively for balanced layout
  const mid = Math.ceil(sessionIds.length / 2);
  const top = sessionIds.slice(0, mid);
  const bottom = sessionIds.slice(mid);
  const eachSize = 100 / sessionIds.length;

  return (
    <Group orientation="vertical" id={`vstack-${sessionIds[0]}`}>
      <Panel defaultSize={eachSize * top.length} minSize={15}>
        {top.length === 1 ? (
          <SessionPane
            session={sessions.get(top[0])!}
            wsRef={wsRef}
            wsVersion={wsVersion}
            onUnpin={() => onUnpin(top[0])}
          />
        ) : (
          <VerticalStack
            sessionIds={top}
            sessions={sessions}
            wsRef={wsRef}
            wsVersion={wsVersion}
            onUnpin={onUnpin}
          />
        )}
      </Panel>
      <Separator className="h-1 bg-border/30 hover:bg-primary/30 transition-colors cursor-row-resize" />
      <Panel defaultSize={eachSize * bottom.length} minSize={15}>
        {bottom.length === 1 ? (
          <SessionPane
            session={sessions.get(bottom[0])!}
            wsRef={wsRef}
            wsVersion={wsVersion}
            onUnpin={() => onUnpin(bottom[0])}
          />
        ) : (
          <VerticalStack
            sessionIds={bottom}
            sessions={sessions}
            wsRef={wsRef}
            wsVersion={wsVersion}
            onUnpin={onUnpin}
          />
        )}
      </Panel>
    </Group>
  );
}
