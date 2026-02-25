"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useConsole } from "@/components/providers/ConsoleProvider";
import { useAgentLaunch } from "@/hooks/useAgentLaunch";
import { useConsoleLauncher } from "@/hooks/useConsoleLauncher";
import { LauncherPicker } from "@/components/console/LauncherPicker";
import { useSidebarResize } from "@/hooks/useSidebarResize";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { collectLeaves, findNode } from "@/lib/console/pane-tree";
import { ConsoleSidebar } from "@/components/console/ConsoleSidebar";
import { ConsoleLayout } from "@/components/console/ConsoleLayout";
import { MultiSessionTiling } from "@/components/console/MultiSessionTiling";
import { CommandPalette } from "@/components/console/CommandPalette";
import { ArchiveModal } from "@/components/console/ArchiveModal";
import { useAutoArchive } from "@/hooks/useAutoArchive";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { clearTerminalBuffer } from "@/lib/console/terminal-registry";
import { clearSerializedBuffer, clearPromptTracker } from "@/lib/console/terminal-cache";
import { deleteScrollback } from "@/lib/console/terminal-db";

export default function ConsolePage() {
  const {
    sessions,
    sessionList,
    activeId,
    activeSession,
    createSession,
    createShellSession,
    switchSession,
    removeSession,
    renameSession,
    archiveSession,
    restoreSession,
    wsRef,
    wsVersion,
    getLastCwd,
    // Group management
    groupList,
    activeGroupId,
    createGroup,
    renameGroup,
    switchGroup,
    archiveGroup,
    clearAllSessions,
  } = useConsole();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);

  // Auto-archive idle sessions
  useAutoArchive();
  const {
    addTerminal,
    layoutMode,
    setLayoutMode,
    setActivePaneId,
    pinnedSessionIds,
    pinSession,
    unpinSession,
    // Multi-group state
    layoutGroups,
    storeActiveGroupId,
    groupOrder,
  } = useConsoleLayoutStore(
    useShallow((s) => ({
      addTerminal: s.addTerminal,
      layoutMode: s.layoutMode,
      setLayoutMode: s.setLayoutMode,
      setActivePaneId: s.setActivePaneId,
      pinnedSessionIds: s.pinnedSessionIds,
      pinSession: s.pinSession,
      unpinSession: s.unpinSession,
      layoutGroups: s.groups,
      storeActiveGroupId: s.activeGroupId,
      groupOrder: s.groupOrder,
    })),
  );

  const latestSessionByGroup = useMemo(() => {
    const map = new Map<string, (typeof sessionList)[number]>();
    for (const session of sessions.values()) {
      if (!session.groupId) continue;
      const current = map.get(session.groupId);
      if (!current || session.createdAt > current.createdAt) {
        map.set(session.groupId, session);
      }
    }
    return map;
  }, [sessions]);

  // Extracted hooks
  useAgentLaunch(createSession);
  const { pickerOpen, setPickerOpen, launchAgent, launchWorkflow } =
    useConsoleLauncher(createSession, wsRef);
  const { sidebarWidth, sidebarCollapsed, handleDragStart, toggleCollapse } =
    useSidebarResize();

  // Create new workspace session (group + shell terminal session)
  const handleCreateSession = useCallback(() => {
    const groupId = createGroup();
    createShellSession({ groupId, cwd: getLastCwd() });
  }, [createGroup, createShellSession, getLastCwd]);

  // Add a Claude session to a specific group
  const handleCreateSessionInGroup = useCallback(
    (groupId: string) => {
      createShellSession({ groupId, cwd: getLastCwd() });
    },
    [createShellSession, getLastCwd],
  );

  // Sync activeSessionId to layout store
  useEffect(() => {
    const store = useConsoleLayoutStore.getState();
    if (store.activeSessionId !== activeId) {
      store.setActiveSessionId(activeId);
    }
  }, [activeId]);

  // Ensure an active session is selected when the active group has sessions.
  useEffect(() => {
    if (activeId) return;
    if (!activeGroupId) return;
    const groupSession = latestSessionByGroup.get(activeGroupId);
    if (groupSession) {
      switchSession(groupSession.id);
    }
  }, [activeId, activeGroupId, latestSessionByGroup, switchSession]);

  // If active session belongs to a different group, switch to the active group's latest session.
  useEffect(() => {
    if (!activeGroupId) return;
    if (!activeSession || activeSession.groupId !== activeGroupId) {
      const groupSession = latestSessionByGroup.get(activeGroupId);
      if (groupSession) {
        switchSession(groupSession.id);
      }
    }
  }, [activeGroupId, activeSession, latestSessionByGroup, switchSession]);

  // Send text to the active session's PTY terminal (for command palette)
  const sendInputToActivePty = useCallback(
    (text: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      let terminalId = activeSession?.terminalId;
      if (activeSession?.kind === "shell") {
        const store = useConsoleLayoutStore.getState();
        const activeLeaf = store.activePaneId
          ? findNode(store.paneTree, store.activePaneId)
          : null;
        if (activeLeaf?.kind === "leaf" && activeLeaf.content.type === "terminal") {
          terminalId = activeLeaf.content.terminalId;
        }
      }
      if (!terminalId) return;
      ws.send(
        JSON.stringify({
          type: "pty:input",
          terminalId,
          data: text + "\r",
        }),
      );
    },
    [activeSession],
  );

  // Tile all active sessions
  const handleTileAllActive = useCallback(() => {
    const activeIds = sessionList
      .filter((s) => s.status !== "idle")
      .map((s) => s.id);
    if (activeIds.length < 2) return;
    for (const id of activeIds) {
      pinSession(id);
    }
  }, [sessionList, pinSession]);

  // Unified session select handler
  const handleSelectSession = useCallback(
    (id: string) => {
      switchSession(id);
    },
    [switchSession],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isInputFocused = tag === "INPUT" || tag === "TEXTAREA";

      if (e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      if (e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        handleCreateSession();
        return;
      }

      if (e.key === "t" && !e.shiftKey) {
        e.preventDefault();
        if (!activeId) {
          toast.error("Select or create a session first.");
          return;
        }
        const store = useConsoleLayoutStore.getState();
        const activeLeaf = store.activePaneId
          ? findNode(store.paneTree, store.activePaneId)
          : null;
        const activeTermId =
          activeLeaf?.kind === "leaf" && activeLeaf.content.type === "terminal"
            ? activeLeaf.content.terminalId
            : null;
        const activeCwd = activeTermId
          ? store.terminals[activeTermId]?.cwd
          : null;
        addTerminal({
          cwd: activeCwd || activeSession?.cwd || ".",
          sessionId: activeId,
        });
        return;
      }

      if (e.key === "t" && e.shiftKey) {
        e.preventDefault();
        if (pinnedSessionIds.length > 0) {
          for (const id of pinnedSessionIds) unpinSession(id);
        } else {
          handleTileAllActive();
        }
        return;
      }

      if (e.key === "\\") {
        e.preventDefault();
        setLayoutMode(layoutMode === "tabbed" ? "tiling" : "tabbed");
        return;
      }

      if (e.key === "w" && !e.shiftKey) {
        e.preventDefault();
        const store = useConsoleLayoutStore.getState();
        const leaf = store.activePaneId
          ? findNode(store.paneTree, store.activePaneId)
          : null;
        if (leaf?.kind === "leaf" && leaf.content.type === "terminal") {
          const ws = wsRef.current;
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "pty:close",
                terminalId: leaf.content.terminalId,
              }),
            );
          }
          store.removeTerminal(leaf.content.terminalId);
          clearTerminalBuffer(leaf.content.terminalId);
          clearSerializedBuffer(leaf.content.terminalId);
          clearPromptTracker(leaf.content.terminalId);
          deleteScrollback(leaf.content.terminalId);
        } else if (activeId) {
          removeSession(activeId);
        }
        return;
      }

      if (e.key === "l" && e.shiftKey && activeId) {
        e.preventDefault();
        const labelEl = document.querySelector("[data-session-label]");
        if (labelEl instanceof HTMLElement) {
          labelEl.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        }
        return;
      }

      if (isInputFocused) return;

      if (e.shiftKey && (e.key === "[" || e.key === "{")) {
        e.preventDefault();
        const store = useConsoleLayoutStore.getState();
        const leaves = collectLeaves(store.paneTree);
        if (leaves.length < 2) return;
        const idx = leaves.findIndex((l) => l.id === store.activePaneId);
        const prev = idx > 0 ? idx - 1 : leaves.length - 1;
        setActivePaneId(leaves[prev].id);
        return;
      }

      if (e.shiftKey && (e.key === "]" || e.key === "}")) {
        e.preventDefault();
        const store = useConsoleLayoutStore.getState();
        const leaves = collectLeaves(store.paneTree);
        if (leaves.length < 2) return;
        const idx = leaves.findIndex((l) => l.id === store.activePaneId);
        const next = idx < leaves.length - 1 ? idx + 1 : 0;
        setActivePaneId(leaves[next].id);
        return;
      }

      // ⌘1-9 switches group (unified: store + session group)
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        e.preventDefault();
        const store = useConsoleLayoutStore.getState();
        const targetGroupId = store.groupOrder[num - 1];
        if (targetGroupId && store.groups[targetGroupId]) {
          switchGroup(targetGroupId);
        }
        return;
      }

      if (e.key === "[") {
        e.preventDefault();
        if (!activeId || sessionList.length < 2) return;
        const idx = sessionList.findIndex((s) => s.id === activeId);
        const prev = idx > 0 ? idx - 1 : sessionList.length - 1;
        handleSelectSession(sessionList[prev].id);
        return;
      }

      if (e.key === "]") {
        e.preventDefault();
        if (!activeId || sessionList.length < 2) return;
        const idx = sessionList.findIndex((s) => s.id === activeId);
        const next = idx < sessionList.length - 1 ? idx + 1 : 0;
        handleSelectSession(sessionList[next].id);
        return;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [
    activeId,
    activeSession,
    sessionList,
    handleSelectSession,
    removeSession,
    addTerminal,
    layoutMode,
    setLayoutMode,
    setActivePaneId,
    pinnedSessionIds,
    unpinSession,
    handleTileAllActive,
    switchGroup,
    handleCreateSession,
  ]);

  // Find the session for a given group (most recent session in that group)
  const getGroupSession = useCallback(
    (groupId: string) => latestSessionByGroup.get(groupId) ?? null,
    [latestSessionByGroup],
  );

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="h-full grid"
        style={{ gridTemplateColumns: `${sidebarWidth}px 4px 1fr` }}
      >
        <ConsoleSidebar
          sessions={sessionList}
          activeId={activeId}
          onSelectSession={handleSelectSession}
          onCloseSession={removeSession}
          onRenameSession={renameSession}
          onArchiveSession={archiveSession}
          pinnedSessionIds={pinnedSessionIds}
          onPinSession={pinSession}
          onUnpinSession={unpinSession}
          groups={groupList}
          activeGroupId={activeGroupId}
          onCreateSession={handleCreateSession}
          onSwitchGroup={switchGroup}
          onArchiveGroup={archiveGroup}
          onClearAllSessions={clearAllSessions}
          onRenameGroup={renameGroup}
          onCreateSessionInGroup={handleCreateSessionInGroup}
          onOpenArchive={() => setArchiveModalOpen(true)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleCollapse}
        />
        {/* Drag handle */}
        <div
          className="cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors"
          onMouseDown={handleDragStart}
        />
        <div className="relative flex flex-col h-full overflow-hidden">
          {pinnedSessionIds.length >= 2 ? (
            <ErrorBoundary>
              <MultiSessionTiling
                sessions={sessions}
                pinnedIds={pinnedSessionIds}
                wsRef={wsRef}
                wsVersion={wsVersion}
                renameSession={renameSession}
                onUnpin={unpinSession}
              />
            </ErrorBoundary>
          ) : groupOrder.length >= 1 ? (
            groupOrder.map((gid) => {
              const groupState = layoutGroups[gid];
              if (!groupState) return null;
              const isActive = gid === (storeActiveGroupId || groupOrder[0]);
              const session = isActive
                ? (activeSession && activeSession.groupId === gid
                  ? activeSession
                  : getGroupSession(gid))
                : getGroupSession(gid);
              return (
                <div
                  key={gid}
                  className="absolute inset-0"
                  style={{
                    opacity: isActive ? 1 : 0,
                    zIndex: isActive ? 1 : 0,
                    pointerEvents: isActive ? 'auto' : 'none',
                  }}
                >
                  <ErrorBoundary>
                    <ConsoleLayout
                      session={session}
                      wsRef={wsRef}
                      wsVersion={wsVersion}
                      groupId={gid}
                      groupPaneTree={groupState.paneTree}
                      groupTerminals={groupState.terminals}
                      groupActivePaneId={groupState.activePaneId}
                      groupFocusedPaneId={groupState.focusedPaneId}
                    />
                  </ErrorBoundary>
                </div>
              );
            })
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <button
                  onClick={handleCreateSession}
                  className="px-6 py-3 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-sm font-medium text-primary transition-colors"
                >
                  New Workspace
                </button>
                <div className="text-xs text-muted-foreground">
                  <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded text-meta">
                    ⌘N
                  </kbd>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onExecute={sendInputToActivePty}
      />
      {pickerOpen && (
        <LauncherPicker
          mode={pickerOpen}
          open
          onClose={() => setPickerOpen(null)}
          onSelectWorkflow={launchWorkflow}
          onSelectAgent={launchAgent}
        />
      )}
      <ArchiveModal
        open={archiveModalOpen}
        onOpenChange={setArchiveModalOpen}
        onRestore={(id) => {
          restoreSession(id);
          setArchiveModalOpen(false);
        }}
      />
    </div>
  );
}
