"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { collectLeafIds, findNode } from "@/lib/console/pane-tree";
import { resolveConsoleCwd } from "@/lib/console/cwd";
import { isMacClient } from "@/lib/platform/client";
import { toast } from "sonner";

export function useKeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const leaderUntilRef = useRef(0);

  useEffect(() => {
    const isMac = isMacClient();

    const handler = (e: KeyboardEvent) => {
      const code = e.code;

      // Shift+1..9 — focus pane by index (on console page, tiling mode)
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && pathname === "/") {
        const digitMatch = code.match(/^Digit([1-9])$/);
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

      const hasAppModifier = isMac
        ? e.altKey && !e.metaKey && !e.ctrlKey
        : e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const isEditableTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");

      const isBareLeaderPress =
        code === "Semicolon" && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (isBareLeaderPress && !isEditableTarget) {
        e.preventDefault();
        leaderUntilRef.current = Date.now() + 2000;
        return;
      }

      const leaderActive = Date.now() <= leaderUntilRef.current;
      if (leaderActive && pathname !== "/") {
        const leaderDigitMatch = code.match(/^Digit([1-9])$/);
        if (leaderDigitMatch) {
          e.preventDefault();
          leaderUntilRef.current = 0;
          const digit = leaderDigitMatch[1];
          switch (digit) {
            case "1":
              router.push("/");
              break;
            case "2":
              router.push("/sessions");
              break;
            case "3":
              router.push("/usage");
              break;
            case "4":
              router.push("/analytics");
              break;
            case "5":
              router.push("/routing");
              break;
            case "6":
              router.push("/agents");
              break;
            case "7":
              router.push("/routing");
              break;
            case "8":
              router.push("/plugins");
              break;
            case "9":
              router.push("/settings");
              break;
          }
          return;
        }
        if (code === "Escape") {
          leaderUntilRef.current = 0;
          return;
        }
      }

      // Avoid stealing Option-based character entry when typing in form fields.
      if (isMac && e.altKey && isEditableTarget) return;

      // On the console page (home), number keys are used for session switching
      if (pathname === "/") {
        // Console controls: Option on Mac, Ctrl on non-Mac.
        if (!hasAppModifier) return;

        // Mod+Shift+M — collapse tiling back to tabbed
        if (code === "KeyM" && e.shiftKey) {
          e.preventDefault();
          const store = useConsoleLayoutStore.getState();
          if (store.layoutMode === "tiling") {
            store.setLayoutMode("tabbed");
          }
          return;
        }

        // Mod+Shift+V — toggle paste history
        if (code === "KeyV" && e.shiftKey) {
          e.preventDefault();
          const store = useConsoleLayoutStore.getState();
          store.setPasteHistoryOpen(!store.pasteHistoryOpen);
          return;
        }

        // Mod+Shift+Enter — maximize/restore focused pane
        if (code === "Enter" && e.shiftKey) {
          e.preventDefault();
          useConsoleLayoutStore.getState().toggleMaximizedPane();
          return;
        }

        // Mod+[ / Mod+] — cycle through panes
        if (code === "BracketLeft" || code === "BracketRight") {
          e.preventDefault();
          const store = useConsoleLayoutStore.getState();
          const leaves = collectLeafIds(store.paneTree);
          if (leaves.length <= 1) return;

          const currentIdx = leaves.indexOf(store.activePaneId ?? "");
          let nextIdx: number;
          if (code === "BracketRight") {
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

        // iTerm-like split shortcuts — Mod+D horizontal, Mod+Shift+D vertical
        if (code === "KeyD") {
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
              cwd: resolveConsoleCwd(cwd),
              sessionId: store.activeSessionId,
            },
            orientation as "h" | "v",
          );
          return;
        }
        return;
      }

      // Route navigation:
      // - Mac: Option to avoid browser-reserved Cmd shortcuts.
      // - Non-Mac: Ctrl.
      if (!hasAppModifier) return;

      const digitMatch = code.match(/^Digit([1-9])$/);
      if (!digitMatch) return;
      const digit = digitMatch[1];

      e.preventDefault();
      switch (digit) {
        case "1":
          router.push("/");
          break;
        case "2":
          router.push("/sessions");
          break;
        case "3":
          router.push("/usage");
          break;
        case "4":
          router.push("/analytics");
          break;
        case "5":
          router.push("/routing");
          break;
        case "6":
          router.push("/agents");
          break;
        case "7":
          router.push("/routing");
          break;
        case "8":
          router.push("/plugins");
          break;
        case "9":
          router.push("/settings");
          break;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [router, pathname]);
}
