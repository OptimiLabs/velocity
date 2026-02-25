import type { GroupLayoutState } from "@/types/console";
import { generateTerminalName } from "@/lib/console/terminal-names";
import { defaultGroupLayout } from "./types";

/** Return a unique adjective-animal terminal name like "swift-fox". */
export function getNextTerminalLabel(group: GroupLayoutState): string {
  const existingNames = new Set(
    Object.values(group.terminals).map((m) => m.label ?? ""),
  );
  return generateTerminalName(existingNames);
}

/** Get the focused group's layout state, falling back to a default. */
export function getActiveGroup(state: {
  groups: Record<string, GroupLayoutState>;
  activeGroupId: string | null;
}): GroupLayoutState {
  if (state.activeGroupId && state.groups[state.activeGroupId]) {
    return state.groups[state.activeGroupId];
  }
  // Fallback: first group or default
  const firstKey = Object.keys(state.groups)[0];
  if (firstKey) return state.groups[firstKey];
  return defaultGroupLayout();
}

/** Extract the four derived properties from a group for top-level sync. */
export function derivedFromGroup(group: GroupLayoutState) {
  return {
    paneTree: group.paneTree,
    activePaneId: group.activePaneId,
    terminals: group.terminals,
    focusedPaneId: group.focusedPaneId,
  };
}

/** Return a partial state update that writes back to a specific group. */
export function updateGroup(
  state: {
    groups: Record<string, GroupLayoutState>;
    activeGroupId: string | null;
  },
  groupId: string,
  updater: (group: GroupLayoutState) => Partial<GroupLayoutState>,
) {
  if (!state.groups[groupId]) return { groups: state.groups };
  const current = state.groups[groupId];
  const updated = { ...current, ...updater(current) };
  const isFocused =
    groupId === (state.activeGroupId || Object.keys(state.groups)[0]);
  return {
    groups: {
      ...state.groups,
      [groupId]: updated,
    },
    // Sync derived fields only if this is the focused group
    ...(isFocused ? derivedFromGroup(updated) : {}),
  };
}

/** Convenience: update the focused group (backward compat for most actions). */
export function updateActiveGroup(
  state: {
    groups: Record<string, GroupLayoutState>;
    activeGroupId: string | null;
  },
  updater: (group: GroupLayoutState) => Partial<GroupLayoutState>,
) {
  const groupId = state.activeGroupId || Object.keys(state.groups)[0];
  if (!groupId) return { groups: state.groups };
  return updateGroup(state, groupId, updater);
}
