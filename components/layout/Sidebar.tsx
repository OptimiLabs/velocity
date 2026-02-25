"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Bot,
  GitBranch,
  Cpu,
  DollarSign,
  History,
  Store,
  Terminal,
  Settings,
  Sun,
  Moon,
  Puzzle,
  Server,
  Sparkles,
  Webhook,
  TerminalSquare,
  Route,
  Microscope,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useProviderScopeStore } from "@/stores/providerScopeStore";
import { isProviderSupportedForConfigRoute } from "@/lib/providers/config-scope";
import { getAllSessionProviders } from "@/lib/providers/session-registry";

type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  query?: string;
  dotColor?: string;
};

type NavSection = {
  id: "workspace" | "build" | "platform";
  label: string;
  description: string;
  items: NavItem[];
};

const headerItem: NavItem = { href: "/", icon: Terminal, label: "Console" };

const navSections: NavSection[] = [
  {
    id: "workspace",
    label: "Workspace",
    description: "Run, inspect, and review activity.",
    items: [
      { href: "/sessions", icon: History, label: "Sessions" },
      { href: "/analyze", icon: Microscope, label: "Review" },
      { href: "/analytics", icon: BarChart3, label: "Analytics" },
      { href: "/usage", icon: DollarSign, label: "Usage" },
    ],
  },
  {
    id: "build",
    label: "Build",
    description: "Configure behaviors and reusable automation.",
    items: [
      { href: "/agents", icon: Bot, label: "Agents" },
      { href: "/workflows", icon: GitBranch, label: "Workflows" },
      { href: "/skills", icon: Sparkles, label: "Skills" },
      { href: "/commands", icon: TerminalSquare, label: "Commands" },
      { href: "/hooks", icon: Webhook, label: "Hooks" },
      { href: "/mcp", icon: Server, label: "MCP Servers" },
      { href: "/routing", icon: Route, label: "Routing" },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    description: "Providers, integrations, and system controls.",
    items: [
      { href: "/models", icon: Cpu, label: "Models" },
      { href: "/plugins", icon: Puzzle, label: "Plugins" },
      { href: "/marketplace", icon: Store, label: "Marketplace" },
      { href: "/settings", icon: Settings, label: "Settings" },
    ],
  },
];

const allSectionItems: NavItem[] = navSections.flatMap((s) => s.items);
const providerDefs = getAllSessionProviders();

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function useIsItemActive(
  pathname: string,
  searchParams: ReturnType<typeof useSearchParams>,
) {
  const queryKeysByHref = new Map<string, string[]>();
  for (const section of navSections) {
    for (const item of section.items) {
      if (!item.query) continue;
      const [key] = item.query.split("=");
      const existing = queryKeysByHref.get(item.href) ?? [];
      existing.push(key);
      queryKeysByHref.set(item.href, existing);
    }
  }

  return useCallback(
    (item: NavItem) => {
      if (item.query) {
        const [key, value] = item.query.split("=");
        return pathname === item.href && searchParams.get(key) === value;
      }
      if (item.href === "/") return pathname === "/";

      const pathMatch =
        pathname === item.href || pathname.startsWith(item.href + "/");
      if (!pathMatch) return false;

      const siblingKeys = queryKeysByHref.get(item.href);
      if (siblingKeys) {
        return siblingKeys.every((key) => !searchParams.get(key));
      }
      return true;
    },
    [pathname, searchParams, queryKeysByHref],
  );
}

function CollapsedItem({
  href,
  icon: Icon,
  label,
  active,
  dotColor,
}: NavItem & { active: boolean }) {
  return (
    <Link
      href={href}
      title={label}
      className={cn(
        "relative flex items-center justify-center rounded-xl border p-2.5 transition-all duration-150 group",
        active
          ? "border-primary/20 bg-nav-active-bg text-foreground shadow-sm"
          : "border-transparent text-muted-foreground hover:border-sidebar-border hover:bg-sidebar-accent/50 hover:text-foreground",
      )}
    >
      {dotColor ? (
        <span className={cn("h-2 w-2 rounded-full", dotColor)} />
      ) : (
        <Icon size={15} strokeWidth={1.6} />
      )}
      <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1 text-xs font-medium opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
        {label}
      </div>
    </Link>
  );
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const providerScope = useProviderScopeStore((s) => s.providerScope);
  const setProviderScope = useProviderScopeStore((s) => s.setProviderScope);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const isItemActive = useIsItemActive(pathname, searchParams);
  const isVisibleForScope = useCallback(
    (href: string) => isProviderSupportedForConfigRoute(href, providerScope),
    [providerScope],
  );

  const visibleSectionItems = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => isVisibleForScope(item.href)),
        }))
        .filter((section) => section.items.length > 0),
    [isVisibleForScope],
  );

  const visibleCollapsedItems = useMemo(
    () => allSectionItems.filter((item) => isVisibleForScope(item.href)),
    [isVisibleForScope],
  );

  return (
    <aside
      className={cn(
        "relative z-20 h-full shrink-0 border-r border-sidebar-border/70 bg-sidebar/90 backdrop-blur-xl transition-all duration-200",
        collapsed ? "w-14" : "w-72",
      )}
    >
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/8 to-transparent pointer-events-none" />

      {collapsed ? (
        <div className="relative flex h-full flex-col">
          <div className="flex h-14 items-center justify-center border-b border-sidebar-border/60">
            <svg
              width={22}
              height={22}
              viewBox="0 0 100 100"
              fill="currentColor"
              className="text-foreground/75"
              aria-hidden
            >
              <circle cx="50" cy="50" r="7" />
              <path d="M50 43 C48 26, 36 16, 24 24 C30 32, 42 40, 50 43Z" />
              <path
                d="M50 43 C48 26, 36 16, 24 24 C30 32, 42 40, 50 43Z"
                transform="rotate(120,50,50)"
              />
              <path
                d="M50 43 C48 26, 36 16, 24 24 C30 32, 42 40, 50 43Z"
                transform="rotate(240,50,50)"
              />
            </svg>
          </div>

          <nav className="flex-1 space-y-4 p-2">
            <div className="space-y-1.5">
              <CollapsedItem {...headerItem} active={isItemActive(headerItem)} />
            </div>
            <div className="space-y-1.5">
              {visibleCollapsedItems.map((item) => (
                <CollapsedItem
                  key={item.label}
                  {...item}
                  href={item.query ? `${item.href}?${item.query}` : item.href}
                  active={isItemActive(item)}
                />
              ))}
            </div>
          </nav>

          <div className="border-t border-sidebar-border/60 p-2">
            {mounted && (
              <button
                type="button"
                onClick={toggleTheme}
                title={theme === "dark" ? "Light mode" : "Dark mode"}
                className="relative flex w-full items-center justify-center rounded-xl border border-transparent p-2.5 text-muted-foreground transition-all duration-150 hover:border-sidebar-border hover:bg-sidebar-accent/50 hover:text-foreground group"
              >
                {theme === "dark" ? (
                  <Sun size={15} strokeWidth={1.6} />
                ) : (
                  <Moon size={15} strokeWidth={1.6} />
                )}
                <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1 text-xs font-medium opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </div>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="relative flex h-full flex-col">
          <div className="border-b border-sidebar-border/60 px-4 py-3">
            <Link href="/" className="flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-sidebar-accent/30">
              <div className="rounded-xl border border-sidebar-border/80 bg-background/80 p-2 shadow-sm">
                <svg
                  width={18}
                  height={18}
                  viewBox="0 0 100 100"
                  fill="currentColor"
                  className="text-foreground/80"
                  aria-hidden
                >
                  <circle cx="50" cy="50" r="7" />
                  <path d="M50 43 C48 26, 36 16, 24 24 C30 32, 42 40, 50 43Z" />
                  <path
                    d="M50 43 C48 26, 36 16, 24 24 C30 32, 42 40, 50 43Z"
                    transform="rotate(120,50,50)"
                  />
                  <path
                    d="M50 43 C48 26, 36 16, 24 24 C30 32, 42 40, 50 43Z"
                    transform="rotate(240,50,50)"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold tracking-tight">
                  Velocity
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Local AI control center
                </div>
              </div>
            </Link>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-3">
            <div className="space-y-4">
              <section className="rounded-2xl border border-primary/25 bg-primary/5 p-1 shadow-sm">
                <Link
                  href={headerItem.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2 text-[13px] transition-all duration-150",
                    isItemActive(headerItem)
                      ? "border-primary/35 bg-nav-active-bg text-foreground shadow-sm"
                      : "border-border/40 bg-background/70 text-foreground/90 hover:border-primary/30 hover:bg-primary/10 hover:text-foreground",
                  )}
                >
                  <headerItem.icon
                    size={15}
                    strokeWidth={1.6}
                    className="text-primary/90"
                  />
                  <span className="font-medium">{headerItem.label}</span>
                </Link>
              </section>

              {visibleSectionItems.map((section) => (
                <section key={section.id} className="rounded-2xl border border-sidebar-border/50 bg-background/35 p-2">
                  <div className="px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {section.label}
                      </div>
                      {section.id === "build" && (
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {providerDefs.map((provider) => {
                            const isActive = providerScope === provider.id;
                            const classes = provider.badgeClasses;
                            return (
                              <button
                                key={provider.id}
                                type="button"
                                onClick={() => setProviderScope(provider.id)}
                                className={cn(
                                  "h-6 rounded-full border px-2 text-[11px] font-semibold leading-none tracking-[0.01em] transition-colors",
                                  isActive
                                    ? cn(classes.bg, classes.text, classes.border)
                                    : "border-sidebar-border/70 bg-muted/35 text-muted-foreground hover:border-sidebar-border hover:text-foreground",
                                )}
                                title={`Switch build scope to ${provider.label}`}
                              >
                                {provider.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-text-tertiary">
                      {section.description}
                    </div>
                  </div>
                  <div className="mt-1 space-y-1">
                    {section.items.map((item) => {
                      const active = isItemActive(item);
                      const supported = isProviderSupportedForConfigRoute(
                        item.href,
                        providerScope,
                      );
                      const href = item.query
                        ? `${item.href}?${item.query}`
                        : item.href;

                      return (
                        <Link
                          key={item.label}
                          href={href}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border px-3 py-2 text-[13px] transition-all duration-150",
                            active && supported
                              ? "border-primary/20 bg-nav-active-bg text-foreground shadow-sm"
                              : !supported
                                ? "border-dashed border-sidebar-border/60 text-text-tertiary hover:border-sidebar-border"
                              : "border-transparent text-muted-foreground hover:border-sidebar-border hover:bg-sidebar-accent/40 hover:text-foreground",
                          )}
                        >
                          {item.dotColor ? (
                            <span
                              className={cn("h-2 w-2 shrink-0 rounded-full", item.dotColor)}
                            />
                          ) : (
                            <item.icon size={14} strokeWidth={1.6} />
                          )}
                          <span className="font-medium">{item.label}</span>
                          {!supported && (
                            <span className="ml-auto rounded-full border border-sidebar-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
                              Unavailable
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </nav>

          <div className="border-t border-sidebar-border/60 p-3">
            {mounted && (
              <button
                type="button"
                onClick={toggleTheme}
                className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-[13px] text-muted-foreground transition-all duration-150 hover:border-sidebar-border hover:bg-sidebar-accent/40 hover:text-foreground"
              >
                {theme === "dark" ? (
                  <Sun size={14} strokeWidth={1.6} />
                ) : (
                  <Moon size={14} strokeWidth={1.6} />
                )}
                <span className="font-medium">
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
