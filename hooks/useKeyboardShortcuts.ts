"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { collectLeafIds, findNode } from "@/lib/console/pane-tree";
import { toast } from "sonner";

export function useKeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Shift+1..9 — focus pane by index (on console page, tiling mode)
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && pathname === "/") {
        const digitMatch = e.code.match(/^Digit([1-9])$/);
        if (digitMatch) {
          const store = useConsoleLayoutStore.getState();
          if (store.layoutMode === "tiling") {
            const idx = parseInt(digitMatch[1], 10) - 1;
            const leaves = collectLeafIds(store.paneTree);
            if (idx < leaves.length) {
              e.preventDefault();
              store.setFocusedPane(leaves[idx]);
            }
          }
          return;
        }
      }

      // Only handle Cmd/Ctrl shortcuts
      if (!(e.metaKey || e.ctrlKey)) return;

      // On the console page (home), number keys are used for session switching
      if (pathname === "/") {
        // Cmd+Shift+M — collapse tiling back to tabbed
        if ((e.key === "m" || e.key === "M") && e.shiftKey) {
          e.preventDefault();
          const store = useConsoleLayoutStore.getState();
          if (store.layoutMode === "tiling") {
            store.setLayoutMode("tabbed");
          }
          return;
        }

        // Cmd+Shift+V — toggle paste history
        if ((e.key === "v" || e.key === "V") && e.shiftKey) {
          e.preventDefault();
          const store = useConsoleLayoutStore.getState();
          store.setPasteHistoryOpen(!store.pasteHistoryOpen);
          return;
        }

        // Cmd+Shift+Enter — maximize/restore focused pane
        if (e.key === "Enter" && e.shiftKey) {
          e.preventDefault();
          useConsoleLayoutStore.getState().toggleMaximizedPane();
          return;
        }

        // Cmd+[ / Cmd+] — cycle through panes
        if (e.key === "[" || e.key === "]") {
          e.preventDefault();
          const store = useConsoleLayoutStore.getState();
          const leaves = collectLeafIds(store.paneTree);
          if (leaves.length <= 1) return;

          const currentIdx = leaves.indexOf(store.activePaneId ?? "");
          let nextIdx: number;
          if (e.key === "]") {
            nextIdx = (currentIdx + 1) % leaves.length;
          } else {
            nextIdx = (currentIdx - 1 + leaves.length) % leaves.length;
          }
          store.setActivePaneId(leaves[nextIdx]);
          if (store.layoutMode === "tiling") {
            store.setFocusedPane(leaves[nextIdx]);
          }
          return;
        }

        // iTerm-like split shortcuts — Cmd+D horizontal, Cmd+Shift+D vertical
        if (e.key === "d" || e.key === "D") {
          e.preventDefault();
          const store = useConsoleLayoutStore.getState();
          if (!store.activeSessionId) {
            toast.error("Select or create a session first.");
            return;
          }
          const orientation = e.shiftKey ? "v" : "h";

          // Determine cwd from focused/active terminal
          const focusedLeaf = store.focusedPaneId
            ? findNode(store.paneTree, store.focusedPaneId)
            : null;
          const activeTermId =
            focusedLeaf?.kind === "leaf" &&
            focusedLeaf.content.type === "terminal"
              ? focusedLeaf.content.terminalId
              : null;
          const cwd = activeTermId ? store.terminals[activeTermId]?.cwd : null;

          // Auto-switch to tiling mode if not already
          if (store.layoutMode !== "tiling") {
            store.setLayoutMode("tiling");
          }

          store.addTerminal(
            {
              cwd: cwd || "~",
              sessionId: store.activeSessionId,
            },
            orientation as "h" | "v",
          );
          return;
        }
        return;
      }

      switch (e.key) {
        case "1":
          e.preventDefault();
          router.push("/");
          break;
        case "2":
          e.preventDefault();
          router.push("/sessions");
          break;
        case "3":
          e.preventDefault();
          router.push("/usage");
          break;
        case "4":
          e.preventDefault();
          router.push("/analytics");
          break;
        case "5":
          e.preventDefault();
          router.push("/routing");
          break;
        case "6":
          e.preventDefault();
          router.push("/agents");
          break;
        case "7":
          e.preventDefault();
          router.push("/routing");
          break;
        case "8":
          e.preventDefault();
          router.push("/plugins");
          break;
        case "9":
          e.preventDefault();
          router.push("/settings");
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, pathname]);
}
