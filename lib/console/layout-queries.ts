/**
 * Layout store query utilities for finding terminals and groups.
 * Uses getState() pattern (no hooks) so these can be called from anywhere.
 */

import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import type { TerminalMeta } from "@/types/console";

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
    for (const [tid, meta] of Object.entries(group.terminals)) {
      if (meta.sessionId === sessionId) {
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
    if (group.terminals[terminalId]) return gid;
  }
  return undefined;
}
