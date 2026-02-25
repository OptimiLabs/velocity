import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  PaneContent,
  PaneNode,
  GroupLayoutState,
  TerminalMeta,
} from "@/types/console";
import {
  splitPane,
  closePane,
  findNode,
  defaultLayout,
  swapPanes,
  movePane,
  collectLeaves,
  findLeafByContent,
  replaceNode,
  paneExists,
} from "@/lib/console/pane-tree";
import {
  addSavedPreset,
  removeSavedPreset,
} from "@/lib/console/layout-presets";

// --- Extracted modules ---
import { migrateState } from "./consoleLayout/migrations";
import {
  getNextTerminalLabel,
  getActiveGroup,
  derivedFromGroup,
  updateGroup,
  updateActiveGroup,
} from "./consoleLayout/group-helpers";
import { defaultGroupLayout } from "./consoleLayout/types";
import type { ConsoleLayoutState } from "./consoleLayout/types";

// Re-export types and helpers so consumers don't need to change import paths
export { defaultGroupLayout } from "./consoleLayout/types";
export type { LayoutMode, ConsoleLayoutState } from "./consoleLayout/types";
export {
  getNextTerminalLabel,
  getActiveGroup,
  derivedFromGroup,
  updateGroup,
  updateActiveGroup,
} from "./consoleLayout/group-helpers";
export { migrateState } from "./consoleLayout/migrations";

export const useConsoleLayoutStore = create<ConsoleLayoutState>()(
  persist(
    (set, get) => ({
      _hydrated: false,
      layoutMode: "tabbed",
      groups: {},
      activeGroupId: null,
      collapsedGroupIds: [],
      groupOrder: [],
      pinnedSessionIds: [],
      activeSessionId: null,
      contextPanelOpen: false,
      pasteHistoryOpen: false,
      setPasteHistoryOpen: (open) => set({ pasteHistoryOpen: open }),
      savedPresets: [],
      savePreset: (name) =>
        set((state) => {
          const group = getActiveGroup(state);
          return {
            savedPresets: addSavedPreset(
              state.savedPresets,
              name,
              group.paneTree,
            ),
          };
        }),
      deletePreset: (name) =>
        set((state) => ({
          savedPresets: removeSavedPreset(state.savedPresets, name),
        })),
      applyPreset: (paneTree) =>
        set((state) => ({
          ...updateActiveGroup(state, () => ({ paneTree })),
          layoutMode: "tiling",
        })),
      isDraggingPane: false,
      maximizedPaneId: null,
      toggleMaximizedPane: () =>
        set((state) => {
          const targetPaneId = state.focusedPaneId || state.activePaneId;
          if (!targetPaneId) return {};
          return {
            maximizedPaneId:
              state.maximizedPaneId === targetPaneId ? null : targetPaneId,
          };
        }),

      setIsDraggingPane: (v) => set({ isDraggingPane: v }),
      setActiveSessionId: (id) => set({ activeSessionId: id }),

      // --- Derived from focused group (synced on every mutation) ---
      paneTree: defaultLayout(),
      focusedPaneId: null,
      activePaneId: null,
      terminals: {},

      // --- Core unified actions ---

      addTerminal: (meta, orientation, targetGroupId) => {
        if (!meta.sessionId) {
          return "";
        }
        const terminalId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const state = get();

        // Step 3c: Ensure target group exists if specified but missing
        let groups = state.groups;
        if (targetGroupId && !groups[targetGroupId]) {
          const newGroup = defaultGroupLayout();
          groups = { ...groups, [targetGroupId]: newGroup };
        }
        const effectiveState = { ...state, groups };

        const resolvedGroupId =
          targetGroupId || state.activeGroupId || Object.keys(groups)[0];
        const group =
          resolvedGroupId && groups[resolvedGroupId]
            ? groups[resolvedGroupId]
            : getActiveGroup(effectiveState);

        // Duplicate guard: only block duplicate Claude sessions (not user-created shell tabs)
        if (meta.sessionId && meta.isClaudeSession) {
          const existing = Object.entries(group.terminals).find(
            ([, m]) => m.sessionId === meta.sessionId && m.isClaudeSession,
          );
          if (existing) return existing[0];
        }

        // Auto-assign label via gap-filling if not provided
        const assignedLabel = meta.label || getNextTerminalLabel(group);
        const finalMeta = { ...meta, label: assignedLabel };

        // Replace empty placeholder with first terminal (no split)
        // Only count terminal leaves belonging to THIS session — other-session
        // terminals in the shared tree shouldn't block the placeholder swap.
        const existingTermLeaves = collectLeaves(group.paneTree).filter(
          (l) =>
            l.content.type === "terminal" &&
            group.terminals[l.content.terminalId]?.sessionId === meta.sessionId,
        );
        if (existingTermLeaves.length === 0) {
          const emptyLeaf = findLeafByContent(
            group.paneTree,
            (c) => c.type === "empty",
          );
          if (emptyLeaf) {
            // Replace the empty leaf wherever it is in the tree
            // Handles single leaf, split trees, or any other shape
            const newTree = replaceNode(group.paneTree, emptyLeaf.id, {
              id: emptyLeaf.id,
              kind: "leaf" as const,
              content: { type: "terminal" as const, terminalId },
            });
            set({
              ...(resolvedGroupId
                ? updateGroup(effectiveState, resolvedGroupId, () => ({
                    terminals: { ...group.terminals, [terminalId]: finalMeta },
                    paneTree: newTree,
                    activePaneId: emptyLeaf.id,
                    tabOrder: [terminalId],
                  }))
                : updateActiveGroup(effectiveState, () => ({
                    terminals: { ...group.terminals, [terminalId]: finalMeta },
                    paneTree: newTree,
                    activePaneId: emptyLeaf.id,
                    tabOrder: [terminalId],
                  }))),
              activeSessionId: meta.sessionId ?? get().activeSessionId,
            });
            return terminalId;
          }
        }

        const newContent: PaneContent = { type: "terminal", terminalId };

        // When orientation IS specified (⌘D split), split the focused pane
        // When orientation is NOT specified ("+"/⌘T), rebuild as balanced grid
        if (orientation) {
          const orient =
            orientation === "v"
              ? ("vertical" as const)
              : ("horizontal" as const);
          const targetId =
            group.focusedPaneId ||
            group.activePaneId ||
            findLeafByContent(group.paneTree, (c) => c.type === "empty")?.id ||
            group.paneTree.id;

          const newTree = splitPane(
            group.paneTree,
            targetId,
            orient,
            newContent,
          );
          const newLeaf = findLeafByContent(
            newTree,
            (c) => c.type === "terminal" && c.terminalId === terminalId,
          );

          const updater = () => ({
            terminals: { ...group.terminals, [terminalId]: finalMeta },
            paneTree: newTree,
            activePaneId: newLeaf?.id ?? group.activePaneId,
            tabOrder: [...(group.tabOrder ?? []), terminalId],
          });

          set({
            ...(resolvedGroupId
              ? updateGroup(effectiveState, resolvedGroupId, updater)
              : updateActiveGroup(effectiveState, updater)),
            activeSessionId: meta.sessionId ?? state.activeSessionId,
          });
        } else if (existingTermLeaves.length === 0) {
          // First terminal for a new session (no empty leaf to replace).
          // Co-locate with an existing terminal leaf so the visibility system
          // can toggle between sessions at the same tree position.
          // Prefer a terminal from the same session for affinity; fall back to any terminal.
          const allLeaves = collectLeaves(group.paneTree);
          const sameSessionTerminal = allLeaves.find(
            (l) =>
              l.content.type === "terminal" &&
              group.terminals[l.content.terminalId]?.sessionId === meta.sessionId,
          );
          const anyTerminal = allLeaves.find(
            (l) => l.content.type === "terminal",
          );
          const colocateTarget = sameSessionTerminal?.id ?? anyTerminal?.id ?? group.paneTree.id;

          const newTree = splitPane(
            group.paneTree,
            colocateTarget,
            "horizontal",
            newContent,
          );
          const newLeaf = findLeafByContent(
            newTree,
            (c) => c.type === "terminal" && c.terminalId === terminalId,
          );

          const updater = () => ({
            terminals: { ...group.terminals, [terminalId]: finalMeta },
            paneTree: newTree,
            activePaneId: newLeaf?.id ?? group.activePaneId,
            tabOrder: [...(group.tabOrder ?? []), terminalId],
          });

          set({
            ...(resolvedGroupId
              ? updateGroup(effectiveState, resolvedGroupId, updater)
              : updateActiveGroup(effectiveState, updater)),
            activeSessionId: meta.sessionId ?? state.activeSessionId,
          });
        } else {
          // Append mode (⌘T): split the focused/active pane, preserving layout
          // Validate focusedPaneId exists in the tree before using it as split target
          const validFocused = group.focusedPaneId && findNode(group.paneTree, group.focusedPaneId)
            ? group.focusedPaneId
            : null;
          const targetId =
            validFocused ||
            group.activePaneId ||
            findLeafByContent(group.paneTree, (c) => c.type === "empty")?.id ||
            group.paneTree.id;

          let newTree = splitPane(
            group.paneTree,
            targetId,
            "horizontal",
            newContent,
          );
          let newLeaf = findLeafByContent(
            newTree,
            (c) => c.type === "terminal" && c.terminalId === terminalId,
          );

          // If split failed (target didn't exist), fall back to root split
          if (!newLeaf) {
            newTree = splitPane(
              group.paneTree,
              group.paneTree.id,
              "horizontal",
              newContent,
            );
            newLeaf = findLeafByContent(
              newTree,
              (c) => c.type === "terminal" && c.terminalId === terminalId,
            );
          }

          const updater = () => ({
            terminals: { ...group.terminals, [terminalId]: finalMeta },
            paneTree: newTree,
            activePaneId: newLeaf?.id ?? group.activePaneId,
            tabOrder: [...(group.tabOrder ?? []), terminalId],
          });

          set({
            ...(resolvedGroupId
              ? updateGroup(effectiveState, resolvedGroupId, updater)
              : updateActiveGroup(effectiveState, updater)),
            activeSessionId: meta.sessionId ?? state.activeSessionId,
          });
        }

        return terminalId;
      },

      removeTerminal: (terminalId) => {
        const state = get();

        // Search ALL groups for the terminal, not just the focused one
        let ownerGroupId: string | null = null;
        let ownerGroup: GroupLayoutState | null = null;
        for (const [gid, g] of Object.entries(state.groups)) {
          if (g.terminals[terminalId]) {
            ownerGroupId = gid;
            ownerGroup = g;
            break;
          }
        }

        // Fallback to focused group if not found in any group
        if (!ownerGroup || !ownerGroupId) {
          ownerGroupId = state.activeGroupId || Object.keys(state.groups)[0];
          ownerGroup = state.groups[ownerGroupId] ?? getActiveGroup(state);
        }

        const leaf = findLeafByContent(
          ownerGroup.paneTree,
          (c) => c.type === "terminal" && c.terminalId === terminalId,
        );
        if (!leaf) {
          // Terminal not in tree — just remove from registry
          const { [terminalId]: _, ...rest } = ownerGroup.terminals;
          set(
            updateGroup(state, ownerGroupId, () => ({
              terminals: rest,
              tabOrder: (ownerGroup.tabOrder ?? []).filter(
                (id) => id !== terminalId,
              ),
            })),
          );
          return;
        }

        const newTree = closePane(ownerGroup.paneTree, leaf.id);
        const { [terminalId]: _, ...rest } = ownerGroup.terminals;

        // If active pane was closed, move to sibling or claude pane
        let newActivePaneId = ownerGroup.activePaneId;
        if (ownerGroup.activePaneId === leaf.id) {
          if (newTree) {
            const leaves = collectLeaves(newTree);
            const termLeaves = leaves.filter(
              (l) => l.content.type === "terminal",
            );
            const emptyLeaf = findLeafByContent(
              newTree,
              (c) => c.type === "empty",
            );
            newActivePaneId =
              termLeaves[termLeaves.length - 1]?.id ??
              emptyLeaf?.id ??
              newTree.id;
          } else {
            newActivePaneId = null;
          }
        }

        set(
          updateGroup(state, ownerGroupId, () => ({
            paneTree: newTree ?? defaultLayout(),
            terminals: rest,
            activePaneId: newActivePaneId,
            focusedPaneId: newTree && ownerGroup!.focusedPaneId && findNode(newTree, ownerGroup!.focusedPaneId)
              ? ownerGroup!.focusedPaneId
              : newActivePaneId,
            tabOrder: (ownerGroup!.tabOrder ?? []).filter(
              (id) => id !== terminalId,
            ),
          })),
        );
      },

      updateTerminalMeta: (terminalId, updates) =>
        set((state) => {
          const hasChanges = (current: TerminalMeta) => {
            for (const [key, value] of Object.entries(updates) as Array<
              [keyof TerminalMeta, TerminalMeta[keyof TerminalMeta]]
            >) {
              if (current[key] !== value) return true;
            }
            return false;
          };

          // Search all groups for the terminal
          for (const [gid, g] of Object.entries(state.groups)) {
            const current = g.terminals[terminalId];
            if (current) {
              if (!hasChanges(current)) {
                return state;
              }
              return updateGroup(state, gid, (group) => ({
                terminals: {
                  ...group.terminals,
                  [terminalId]: { ...current, ...updates },
                },
              }));
            }
          }

          const activeGroup = getActiveGroup(state);
          const existing = activeGroup.terminals[terminalId];
          if (existing && !hasChanges(existing)) {
            return state;
          }

          const fallbackMeta = existing
            ? { ...existing, ...updates }
            : { label: "Terminal", cwd: "~", ...updates };

          // Fallback: update in focused group
          return updateActiveGroup(state, (group) => ({
            terminals: {
              ...group.terminals,
              [terminalId]: fallbackMeta,
            },
          }));
        }),

      consumePendingPrompt: (terminalId) => {
        // Search all groups for the terminal (may not be in focused group)
        const state = get();
        for (const [groupId, group] of Object.entries(state.groups)) {
          const meta = group.terminals[terminalId];
          if (meta?.pendingPrompt) {
            const prompt = meta.pendingPrompt;
            // Clear it atomically
            const updatedGroup = {
              ...group,
              terminals: {
                ...group.terminals,
                [terminalId]: { ...meta, pendingPrompt: undefined },
              },
            };
            set({
              groups: { ...state.groups, [groupId]: updatedGroup },
              // Sync derived props if this is the focused group
              ...(groupId ===
              (state.activeGroupId || Object.keys(state.groups)[0])
                ? derivedFromGroup(updatedGroup)
                : {}),
            });
            return prompt;
          }
        }
        return undefined;
      },

      setActivePaneId: (paneId) =>
        set((state) =>
          updateActiveGroup(state, (group) => {
            if (paneId !== null && !paneExists(group.paneTree, paneId))
              return {};
            if (group.activePaneId === paneId) return {};
            return { activePaneId: paneId };
          }),
        ),

      setLayoutMode: (mode) => set({ layoutMode: mode }),

      // --- Tiling actions (operate on focused group's paneTree) ---

      splitPaneAction: (paneId, orientation, content) =>
        set((state) =>
          updateActiveGroup(state, (group) => ({
            paneTree: splitPane(group.paneTree, paneId, orientation, content),
          })),
        ),

      closePaneAction: (paneId) =>
        set((state) => {
          const group = getActiveGroup(state);
          // Check if the pane being closed is a context pane (before it's removed)
          const node = findNode(group.paneTree, paneId);
          const isContextPane =
            node?.kind === "leaf" && node.content.type === "context";

          return {
            ...(isContextPane ? { contextPanelOpen: false } : {}),
            ...updateActiveGroup(state, (g) => {
              const result = closePane(g.paneTree, paneId);
              return {
                paneTree: result ?? defaultLayout(),
                focusedPaneId: result ? g.focusedPaneId : null,
              };
            }),
          };
        }),

      setFocusedPane: (paneId) =>
        set((state) => {
          const group = getActiveGroup(state);
          if (group.focusedPaneId === paneId) return state;
          return updateActiveGroup(state, () => ({ focusedPaneId: paneId }));
        }),

      updatePaneSizes: (splitId, sizes) =>
        set((state) => {
          const group = getActiveGroup(state);
          const node = findNode(group.paneTree, splitId);
          if (!node || node.kind !== "split") return state;

          const prevLeft = node.sizes?.[0] ?? 50;
          const prevRight = node.sizes?.[1] ?? 50;
          const [nextLeft, nextRight] = sizes;
          if (
            Math.abs(prevLeft - nextLeft) < 0.05 &&
            Math.abs(prevRight - nextRight) < 0.05
          ) {
            return state;
          }

          const updateSizes = (n: PaneNode): PaneNode => {
            if (n.id === splitId && n.kind === "split")
              return { ...n, sizes };
            if (n.kind === "split") {
              return {
                ...n,
                children: [updateSizes(n.children[0]), updateSizes(n.children[1])],
              };
            }
            return n;
          };

          return updateActiveGroup(state, () => ({
            paneTree: updateSizes(group.paneTree),
          }));
        }),

      swapPanesAction: (idA, idB) =>
        set((state) =>
          updateActiveGroup(state, (group) => ({
            paneTree: swapPanes(group.paneTree, idA, idB),
          })),
        ),

      movePaneAction: (sourceId, targetId, position) =>
        set((state) =>
          updateActiveGroup(state, (group) => ({
            paneTree: movePane(group.paneTree, sourceId, targetId, position),
          })),
        ),

      // Multi-session tiling
      pinSession: (id) =>
        set((state) => ({
          pinnedSessionIds: state.pinnedSessionIds.includes(id)
            ? state.pinnedSessionIds
            : [...state.pinnedSessionIds, id],
          layoutMode: "tiling",
        })),

      unpinSession: (id) =>
        set((state) => {
          const filtered = state.pinnedSessionIds.filter((s) => s !== id);
          return {
            pinnedSessionIds: filtered,
            layoutMode: filtered.length === 0 ? "tabbed" : state.layoutMode,
          };
        }),

      setTiledLayout: (root) =>
        set((state) => updateActiveGroup(state, () => ({ paneTree: root }))),

      // --- Group actions ---

      createGroup: (id) =>
        set((state) => {
          const newGroup = defaultGroupLayout();
          return {
            groups: { ...state.groups, [id]: newGroup },
            activeGroupId: id,
            groupOrder: [...state.groupOrder, id],
            ...derivedFromGroup(newGroup),
          };
        }),

      ensureGroup: (id) =>
        set((state) => {
          if (state.groups[id]) return {};
          const newGroup = defaultGroupLayout();
          return {
            groups: { ...state.groups, [id]: newGroup },
            groupOrder: [...state.groupOrder, id],
          };
        }),

      setActiveGroup: (groupId) =>
        set((state) => {
          if (!state.groups[groupId]) return {};
          const group = state.groups[groupId];
          // Also expand the group if it's collapsed
          const collapsedGroupIds = state.collapsedGroupIds.filter(
            (id) => id !== groupId,
          );
          return {
            activeGroupId: groupId,
            collapsedGroupIds,
            ...derivedFromGroup(group),
            maximizedPaneId: null,
          };
        }),

      toggleGroupCollapsed: (groupId) =>
        set((state) => {
          const isCollapsed = state.collapsedGroupIds.includes(groupId);
          if (isCollapsed) {
            return {
              collapsedGroupIds: state.collapsedGroupIds.filter(
                (id) => id !== groupId,
              ),
            };
          } else {
            // If collapsing the focused group, move focus to next expanded group
            let newFocusedGroupId = state.activeGroupId;
            if (state.activeGroupId === groupId) {
              const nextExpanded = state.groupOrder.find(
                (id) => id !== groupId && !state.collapsedGroupIds.includes(id),
              );
              newFocusedGroupId = nextExpanded ?? state.activeGroupId;
            }
            const patch: Partial<ConsoleLayoutState> = {
              collapsedGroupIds: [...state.collapsedGroupIds, groupId],
            };
            if (
              newFocusedGroupId !== state.activeGroupId &&
              newFocusedGroupId &&
              state.groups[newFocusedGroupId]
            ) {
              patch.activeGroupId = newFocusedGroupId;
              Object.assign(
                patch,
                derivedFromGroup(state.groups[newFocusedGroupId]),
              );
            }
            return patch;
          }
        }),

      switchGroup: (groupId) =>
        set((state) => {
          if (!state.groups[groupId]) return {};
          let group = { ...state.groups[groupId] };

          // Scan for context leaf
          const leaves = collectLeaves(group.paneTree);
          let contextLeaf: (PaneNode & { kind: "leaf" }) | null = null;
          for (const leaf of leaves) {
            if (leaf.content.type === "context") contextLeaf = leaf;
          }

          if (state.contextPanelOpen && !contextLeaf) {
            // Inject context pane into target group
            const claudeId = group.paneTree.id;
            group = {
              ...group,
              paneTree: splitPane(group.paneTree, claudeId, "horizontal", {
                type: "context",
              }),
            };
          } else if (!state.contextPanelOpen && contextLeaf) {
            // Remove stale context pane from target group
            const result = closePane(group.paneTree, contextLeaf.id);
            group = {
              ...group,
              paneTree: result ?? defaultLayout(),
              focusedPaneId: result ? group.focusedPaneId : null,
            };
          }

          // Validate activePaneId and focusedPaneId after tree mutation (inject/remove changes IDs)
          if (!paneExists(group.paneTree, group.activePaneId)) {
            // Fall back to first terminal leaf, then empty leaf, then root
            const freshLeaves = collectLeaves(group.paneTree);
            const firstTerminal = freshLeaves.find(
              (l) => l.content.type === "terminal",
            );
            const freshEmpty = freshLeaves.find(
              (l) => l.content.type === "empty",
            );
            group = {
              ...group,
              activePaneId:
                firstTerminal?.id ?? freshEmpty?.id ?? group.paneTree.id,
            };
          }
          if (
            group.focusedPaneId &&
            !paneExists(group.paneTree, group.focusedPaneId)
          ) {
            group = { ...group, focusedPaneId: null };
          }

          return {
            activeGroupId: groupId,
            groups: { ...state.groups, [groupId]: group },
            ...derivedFromGroup(group),
            // Clear maximized pane — it belongs to the previous group's tree
            maximizedPaneId: null,
          };
        }),

      removeGroup: (groupId) =>
        set((state) => {
          const { [groupId]: _, ...rest } = state.groups;
          let newFocusedGroupId = state.activeGroupId;
          if (state.activeGroupId === groupId) {
            const remaining = Object.keys(rest);
            newFocusedGroupId = remaining.length > 0 ? remaining[0] : null;
          }
          const newGroup =
            newFocusedGroupId && rest[newFocusedGroupId]
              ? rest[newFocusedGroupId]
              : defaultGroupLayout();
          return {
            groups: rest,
            activeGroupId: newFocusedGroupId,
            groupOrder: state.groupOrder.filter((id) => id !== groupId),
            collapsedGroupIds: state.collapsedGroupIds.filter(
              (id) => id !== groupId,
            ),
            ...derivedFromGroup(newGroup),
          };
        }),

      getGroupState: (groupId) => {
        return get().groups[groupId];
      },

      // --- Legacy action wrappers ---

      addTerminalTab: (tab) => {
        const state = get();
        const group = getActiveGroup(state);

        const newContent: PaneContent = {
          type: "terminal",
          terminalId: tab.id,
        };

        // Find the empty placeholder pane or root to split
        const targetId =
          findLeafByContent(group.paneTree, (c) => c.type === "empty")?.id ||
          group.paneTree.id;

        const newTree = splitPane(
          group.paneTree,
          targetId,
          "horizontal",
          newContent,
        );
        const newLeaf = findLeafByContent(
          newTree,
          (c) => c.type === "terminal" && c.terminalId === tab.id,
        );

        set(
          updateActiveGroup(state, () => ({
            terminals: {
              ...group.terminals,
              [tab.id]: {
                label: tab.label,
                cwd: tab.cwd,
                envOverrides: tab.envOverrides,
              },
            },
            paneTree: newTree,
            activePaneId: newLeaf?.id ?? group.activePaneId,
          })),
        );
      },

      removeTerminalTab: (id) => {
        get().removeTerminal(id);
      },

      setActiveTab: (tab) => {
        const state = get();
        const group = getActiveGroup(state);
        const leaves = collectLeaves(group.paneTree);
        let target: PaneNode | undefined;
        switch (tab) {
          case "terminal": {
            // Find the currently active terminal, or first terminal
            const activeLeaf = group.activePaneId
              ? findNode(group.paneTree, group.activePaneId)
              : null;
            if (
              activeLeaf?.kind === "leaf" &&
              activeLeaf.content.type === "terminal"
            ) {
              target = activeLeaf;
            } else {
              target = leaves.find((l) => l.content.type === "terminal");
            }
            break;
          }
          case "env":
          case "settings":
            target = leaves.find((l) => l.content.type === "settings");
            if (!target) {
              // Create settings pane if it doesn't exist
              const claudeId =
                findLeafByContent(group.paneTree, (c) => c.type === "empty")
                  ?.id || group.paneTree.id;
              const newTree = splitPane(
                group.paneTree,
                claudeId,
                "horizontal",
                { type: "settings" },
              );
              const settingsLeaf = findLeafByContent(
                newTree,
                (c) => c.type === "settings",
              );
              set(
                updateActiveGroup(state, () => ({
                  paneTree: newTree,
                  activePaneId: settingsLeaf?.id ?? null,
                })),
              );
              return;
            }
            break;
          case "context":
            target = leaves.find((l) => l.content.type === "context");
            if (!target) {
              const claudeId =
                findLeafByContent(group.paneTree, (c) => c.type === "empty")
                  ?.id || group.paneTree.id;
              const newTree = splitPane(
                group.paneTree,
                claudeId,
                "horizontal",
                { type: "context" },
              );
              const contextLeaf = findLeafByContent(
                newTree,
                (c) => c.type === "context",
              );
              set({
                contextPanelOpen: true,
                ...updateActiveGroup(state, () => ({
                  paneTree: newTree,
                  activePaneId: contextLeaf?.id ?? null,
                })),
              });
              return;
            }
            // Context leaf already exists — still mark panel as open
            set({ contextPanelOpen: true });
            break;
        }
        if (target) {
          set(updateActiveGroup(state, () => ({ activePaneId: target!.id })));
        }
      },

      setActiveTerminalTab: (id) => {
        if (!id) return;
        const state = get();
        const group = getActiveGroup(state);
        const leaf = findLeafByContent(
          group.paneTree,
          (c) => c.type === "terminal" && c.terminalId === id,
        );
        if (leaf) {
          set(updateActiveGroup(state, () => ({ activePaneId: leaf.id })));
        }
      },

      updateTerminalEnv: (id, env) => {
        const state = get();
        const group = getActiveGroup(state);
        const existing = group.terminals[id];
        if (existing) {
          set(
            updateActiveGroup(state, () => ({
              terminals: {
                ...group.terminals,
                [id]: {
                  ...existing,
                  envOverrides: { ...existing.envOverrides, ...env },
                },
              },
            })),
          );
        }
      },

      reorderTerminalTabs: (fromId: string, toId: string, groupId?: string) =>
        set((state) => {
          const gid =
            groupId ?? state.activeGroupId ?? Object.keys(state.groups)[0];
          return updateGroup(state, gid, (group) => {
            const order = [...(group.tabOrder ?? [])];
            const fromIdx = order.indexOf(fromId);
            const toIdx = order.indexOf(toId);
            if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return {};

            // Scope reorder to the same session: only move within terminals
            // that share the same sessionId as the dragged terminal.
            const fromMeta = group.terminals[fromId];
            const toMeta = group.terminals[toId];
            if (
              fromMeta?.sessionId &&
              toMeta?.sessionId &&
              fromMeta.sessionId !== toMeta.sessionId
            ) {
              return {}; // Don't reorder across sessions
            }

            const [moved] = order.splice(fromIdx, 1);
            order.splice(toIdx, 0, moved);
            return { tabOrder: order };
          });
        }),

      detachPaneToTab: () => {
        // No-op in unified model — tree persists across modes
      },

      mergePanes: () => {
        // No-op in unified model — tree persists across modes, just switch layout
        set({ layoutMode: "tabbed" });
      },
    }),
    {
      name: "console-layout",
      version: 17,
      migrate: (persisted: unknown, version: number) => {
        return migrateState(persisted, version);
      },
      partialize: (state) => ({
        layoutMode: state.layoutMode,
        groups: state.groups,
        activeGroupId: state.activeGroupId,
        collapsedGroupIds: state.collapsedGroupIds,
        groupOrder: state.groupOrder,
        pinnedSessionIds: state.pinnedSessionIds,
        contextPanelOpen: state.contextPanelOpen,
        maximizedPaneId: state.maximizedPaneId,
        savedPresets: state.savedPresets,
      }),
      onRehydrateStorage: () => (state) => {
        // Defer setState to next microtask — onRehydrateStorage fires during
        // create(), before useConsoleLayoutStore is assigned.
        const apply = (patch: Partial<ConsoleLayoutState>) => {
          queueMicrotask(() => {
            try {
              useConsoleLayoutStore.setState(patch);
            } catch (e) {
              console.error("Store rehydration failed:", e);
              setTimeout(
                () => useConsoleLayoutStore.setState({ _hydrated: true }),
                0,
              );
            }
          });
        };
        try {
          if (!state) {
            apply({ _hydrated: true });
            return;
          }

          // Clean up stale references in groupOrder and collapsedGroupIds
          const existingGroupIds = new Set(Object.keys(state.groups));
          const cleanGroupOrder = state.groupOrder.filter((id) =>
            existingGroupIds.has(id),
          );
          const cleanCollapsedGroupIds = state.collapsedGroupIds.filter((id) =>
            existingGroupIds.has(id),
          );
          const patchCleanup: Partial<ConsoleLayoutState> = {};
          if (cleanGroupOrder.length !== state.groupOrder.length) {
            patchCleanup.groupOrder = cleanGroupOrder;
          }
          if (
            cleanCollapsedGroupIds.length !== state.collapsedGroupIds.length
          ) {
            patchCleanup.collapsedGroupIds = cleanCollapsedGroupIds;
          }

          // Validate pane trees: remove terminal leaves whose terminalId isn't in group.terminals
          let groupsDirty = false;
          const cleanGroups = { ...state.groups };
          for (const [gid, group] of Object.entries(cleanGroups)) {
            const termIds = new Set(Object.keys(group.terminals));
            const leaves = collectLeaves(group.paneTree);
            const staleLeaf = leaves.find(
              (l) =>
                l.content.type === "terminal" &&
                !termIds.has(l.content.terminalId),
            );
            if (staleLeaf) {
              // Prune all stale terminal leaves
              let tree = group.paneTree;
              for (const leaf of leaves) {
                if (
                  leaf.content.type === "terminal" &&
                  !termIds.has(leaf.content.terminalId)
                ) {
                  const result = closePane(tree, leaf.id);
                  tree = result ?? defaultLayout();
                }
              }
              cleanGroups[gid] = { ...group, paneTree: tree };
              groupsDirty = true;
            }

            // Reverse cleanup: prune orphaned Claude terminal records (in record but not in tree)
            const treeTermIds = new Set(
              leaves
                .filter(
                  (l): l is typeof l & { content: { terminalId: string } } =>
                    l.content.type === "terminal",
                )
                .map((l) => l.content.terminalId),
            );
            const cleanTerminals = {
              ...(cleanGroups[gid]?.terminals ?? group.terminals),
            };
            let terminalsDirty = false;
            for (const [tid] of Object.entries(cleanTerminals)) {
              if (treeTermIds.has(tid)) continue; // has a terminal leaf — keep
              delete cleanTerminals[tid];
              terminalsDirty = true;
            }

            if (terminalsDirty) {
              cleanGroups[gid] = {
                ...cleanGroups[gid],
                terminals: cleanTerminals,
              };
              groupsDirty = true;
            }

            // Reconcile tabOrder: remove stale IDs, append missing terminal IDs
            const currentGroup = cleanGroups[gid];
            const allTermIds = Object.keys(currentGroup.terminals);
            const existingOrder = new Set(currentGroup.tabOrder ?? []);
            const validTermSet = new Set(allTermIds);
            const cleanedOrder = (currentGroup.tabOrder ?? []).filter((id) =>
              validTermSet.has(id),
            );
            const missing = allTermIds.filter((id) => !existingOrder.has(id));
            const reconciledOrder = [...cleanedOrder, ...missing];
            if (
              reconciledOrder.length !== (currentGroup.tabOrder ?? []).length ||
              reconciledOrder.some(
                (id, i) => id !== (currentGroup.tabOrder ?? [])[i],
              )
            ) {
              cleanGroups[gid] = { ...currentGroup, tabOrder: reconciledOrder };
              groupsDirty = true;
            }
          }
          if (groupsDirty) {
            patchCleanup.groups = cleanGroups;
          }

          const gid = state.activeGroupId || Object.keys(state.groups)[0];
          if (gid && state.groups[gid]) {
            const g = state.groups[gid];
            apply({ _hydrated: true, ...derivedFromGroup(g), ...patchCleanup });
          } else {
            apply({ _hydrated: true, ...patchCleanup });
          }
        } catch (e) {
          console.error("Store rehydration failed:", e);
          apply({ _hydrated: true });
        }
      },
    },
  ),
);
