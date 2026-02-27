"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// --- Generic resizable panel hook ---

interface ResizablePanelConfig {
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
  storageKey: string;
  side: "left" | "right";
}

function getStoredPanelWidth(
  storageKey: string,
  defaultWidth: number,
  minWidth: number,
  maxWidth: number,
): number {
  if (typeof window === "undefined") return defaultWidth;
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    const n = parseInt(stored, 10);
    if (n >= minWidth && n <= maxWidth) return n;
  }
  return defaultWidth;
}

export function useResizablePanel(config: ResizablePanelConfig) {
  const { minWidth, maxWidth, defaultWidth, storageKey, side } = config;
  const [width, setWidth] = useState(defaultWidth);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  useEffect(() => {
    setWidth(getStoredPanelWidth(storageKey, defaultWidth, minWidth, maxWidth));
  }, [storageKey, defaultWidth, minWidth, maxWidth]);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      dragStartX.current = e.clientX;
      dragStartWidth.current = width;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const delta =
          side === "left"
            ? ev.clientX - dragStartX.current
            : dragStartX.current - ev.clientX;
        const newWidth = Math.max(
          minWidth,
          Math.min(maxWidth, dragStartWidth.current + delta),
        );
        setWidth(newWidth);
      };

      const handleUp = () => {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        setWidth((prev) => {
          localStorage.setItem(storageKey, String(prev));
          return prev;
        });
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [width, minWidth, maxWidth, storageKey, side],
  );

  return { width, handleDragStart };
}

// --- Sidebar-specific wrapper (backwards compat) ---

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 260;
export const SIDEBAR_COLLAPSED = 48;

interface SidebarResizeOptions {
  storageKey?: string;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  collapsedWidth?: number;
}

export function useSidebarResize(
  options: SidebarResizeOptions | string = {},
) {
  const normalizedOptions =
    typeof options === "string" ? { storageKey: options } : options;
  const {
    storageKey = "console-sidebar-width",
    minWidth = SIDEBAR_MIN,
    maxWidth = SIDEBAR_MAX,
    defaultWidth = SIDEBAR_DEFAULT,
    collapsedWidth = SIDEBAR_COLLAPSED,
  } = normalizedOptions;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { width, handleDragStart } = useResizablePanel({
    minWidth,
    maxWidth,
    defaultWidth,
    storageKey,
    side: "left",
  });

  const toggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const effectiveSidebarWidth = sidebarCollapsed ? collapsedWidth : width;

  return {
    sidebarWidth: effectiveSidebarWidth,
    sidebarCollapsed,
    handleDragStart,
    toggleCollapse,
  };
}
