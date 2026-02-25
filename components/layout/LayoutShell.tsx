"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useRoutingStore } from "@/stores/routingStore";
import { useWorkflowBuilderLayoutStore } from "@/stores/workflowBuilderLayoutStore";

const STORAGE_KEY = "claude-sidebar-collapsed";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const routingFullscreen = useRoutingStore((s) => s.isFullscreen);
  const setRoutingFullscreen = useRoutingStore((s) => s.setFullscreen);
  const workflowFullscreen = useWorkflowBuilderLayoutStore(
    (s) => s.isFullscreen,
  );
  const setWorkflowFullscreen = useWorkflowBuilderLayoutStore(
    (s) => s.setFullscreen,
  );
  const isRoutingRoute = pathname.startsWith("/routing");
  const isWorkflowBuilderRoute = /^\/workflows\/[^/]+$/.test(pathname);
  const hideChrome =
    (isRoutingRoute && routingFullscreen) ||
    (isWorkflowBuilderRoute && workflowFullscreen);

  // Hydrate from localStorage after mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "true") setCollapsed(true);
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  // Global keyboard shortcut ⌘B
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b" && !e.shiftKey) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);

  useEffect(() => {
    if (!isRoutingRoute && routingFullscreen) {
      setRoutingFullscreen(false);
    }
  }, [isRoutingRoute, routingFullscreen, setRoutingFullscreen]);

  useEffect(() => {
    if (!isWorkflowBuilderRoute && workflowFullscreen) {
      setWorkflowFullscreen(false);
    }
  }, [isWorkflowBuilderRoute, workflowFullscreen, setWorkflowFullscreen]);

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      {!hideChrome && (
        <Suspense>
          <Sidebar collapsed={collapsed} onToggleCollapse={toggle} />
        </Suspense>
      )}
      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        {!hideChrome && (
          <Suspense>
            <Header collapsed={collapsed} onToggleCollapse={toggle} />
          </Suspense>
        )}
        <main className="flex-1 overflow-auto relative">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
