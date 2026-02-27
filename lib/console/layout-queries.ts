/**
 * Layout store query utilities for finding terminals and groups.
 * Uses getState() pattern (no hooks) so these can be called from anywhere.
 */

import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import type { TerminalMeta } from "@/types/console";
import { collectLeaves } from "@/lib/console/pane-tree";

/**
 * Scan layout store groups for a terminal whose sessionId matches.
 */
export function findTerminalForSession(sessionId: string): {
  terminalId?: string;
  groupId?: string;
  meta?: TerminalMeta;
} {
  const { groups } = useConsoleLayoutStore.getState();
  for (const [gid, group] of Object.entries(groups)) {
    const terminalLeafIds: string[] = [];
    for (const leaf of collectLeaves(group.paneTree)) {
      if (leaf.content.type === "terminal") {
        terminalLeafIds.push(leaf.content.terminalId);
      }
    }
    const leafSet = new Set(terminalLeafIds);

    for (const tid of group.tabOrder ?? []) {
      if (!leafSet.has(tid)) continue;
      const meta = group.terminals[tid];
      if (meta?.sessionId === sessionId) {
        return { terminalId: tid, groupId: gid, meta };
      }
    }

    for (const tid of terminalLeafIds) {
      const meta = group.terminals[tid];
      if (meta?.sessionId === sessionId) {
        return { terminalId: tid, groupId: gid, meta };
      }
    }
  }
  return {};
}

/**
 * Find the group that owns a terminal ID.
 */
export function findGroupIdForTerminal(terminalId: string): string | undefined {
  const { groups } = useConsoleLayoutStore.getState();
  for (const [gid, group] of Object.entries(groups)) {
    if (!group.terminals[terminalId]) continue;
    const existsInTree = collectLeaves(group.paneTree).some(
      (leaf) =>
        leaf.content.type === "terminal" &&
        leaf.content.terminalId === terminalId,
    );
    if (existsInTree) return gid;
  }
  return undefined;
}
