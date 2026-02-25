"use client";

import { Server, Key, Puzzle } from "lucide-react";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/ui/status-pill";
import type { ToolInfo } from "@/hooks/useTools";
import type { MCPServerCache } from "@/hooks/useMCP";

type HealthStatus = "healthy" | "error" | "unknown";

interface MCPServerCardProps {
  server: ToolInfo;
  cached?: MCPServerCache;
  variant?: "row" | "card";
  selected: boolean;
  onSelect: () => void;
  onToggle?: (name: string, enabled: boolean) => void;
}

function healthFromCache(cached?: MCPServerCache): HealthStatus {
  if (!cached) return "unknown";
  if (cached.error) return "error";
  return "healthy";
}

const healthDotClass: Record<HealthStatus, string> = {
  healthy: "bg-success",
  error: "bg-destructive",
  unknown: "bg-muted-foreground/40",
};

export function MCPServerCard({
  server,
  cached,
  variant = "row",
  selected,
  onSelect,
  onToggle,
}: MCPServerCardProps) {
  const isEnabled = server.enabled !== false;
  const isPluginManaged = !!server.pluginId;
  const health = healthFromCache(cached);
  const toolCount = cached?.tools?.length ?? 0;
  const transport = server.url ? "http" : "stdio";
  const envKeys = server.env ? Object.keys(server.env) : [];
  const commandPreview = server.command
    ? `${server.command}${server.args?.length ? ` ${server.args.join(" ")}` : ""}`
    : null;
  const toggleTitle = isPluginManaged
    ? `Managed by plugin ${server.plugin || server.pluginId}`
    : isEnabled
      ? "Disable server"
      : "Enable server";
  const statusPill = onToggle ? (
    <StatusPill
      enabled={isEnabled}
      onToggle={
        isPluginManaged ? undefined : () => onToggle(server.name, isEnabled)
      }
      onClick={
        isPluginManaged
          ? undefined
          : (e) => {
              e.stopPropagation();
            }
      }
      className="shrink-0"
      title={toggleTitle}
    />
  ) : null;

  if (variant === "card") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          "rounded-xl border border-border/60 bg-card/80 p-3 transition-all hover:border-border hover:bg-muted/20",
          selected && "ring-1 ring-primary/40 border-primary/30",
          !isEnabled && "opacity-55",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={cn("h-2 w-2 rounded-full shrink-0", healthDotClass[health])}
                title={health}
              />
              <Server size={12} className="text-chart-1 shrink-0" />
              <span className="truncate text-xs font-mono font-medium">
                {server.name}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Badge variant="outline" className="text-micro">
                {transport}
              </Badge>
              <Badge variant="secondary" className="text-micro tabular-nums">
                {toolCount} tool{toolCount !== 1 ? "s" : ""}
              </Badge>
              {server.plugin && (
                <Badge
                  variant="outline"
                  className="text-micro gap-0.5 text-chart-3 border-chart-3/30"
                  title={server.plugin}
                >
                  <Puzzle size={8} />
                  <span className="max-w-[90px] truncate">{server.plugin}</span>
                </Badge>
              )}
            </div>
          </div>
          {statusPill}
        </div>

        {server.url ? (
          <a
            href={server.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-2 block truncate rounded-md bg-muted/35 px-2 py-1 text-micro font-mono text-muted-foreground/80 hover:text-chart-1"
            title={server.url}
          >
            {server.url}
          </a>
        ) : commandPreview ? (
          <div
            className="mt-2 truncate rounded-md bg-muted/35 px-2 py-1 text-micro font-mono text-muted-foreground/80"
            title={commandPreview}
          >
            {commandPreview}
          </div>
        ) : null}

        {envKeys.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {envKeys.slice(0, 2).map((k) => (
              <Badge
                key={k}
                variant="outline"
                className="text-micro gap-0.5 font-mono text-muted-foreground/70"
              >
                <Key size={8} />
                {k}
              </Badge>
            ))}
            {envKeys.length > 2 && (
              <Badge variant="outline" className="text-micro text-muted-foreground/70">
                +{envKeys.length - 2}
              </Badge>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 border-b border-border/30 cursor-pointer transition-colors rounded-md hover:bg-muted/40",
        selected && "ring-1 ring-primary/40",
        !isEnabled && "opacity-50",
      )}
    >
          {/* Health dot */}
          <span
            className={cn(
              "h-2 w-2 rounded-full shrink-0",
              healthDotClass[health],
            )}
            title={health}
          />

          <Server size={13} className="text-chart-1 shrink-0" />

          <span className="text-xs font-mono font-medium truncate">
            {server.name}
          </span>

          <Badge variant="outline" className="text-micro shrink-0">
            {transport}
          </Badge>

          {server.plugin && (
            <Badge
              variant="outline"
              className="text-micro shrink-0 gap-0.5 text-chart-3 border-chart-3/30"
            >
              <Puzzle size={8} />
              {server.plugin}
            </Badge>
          )}

          <Badge
            variant="secondary"
            className="text-micro shrink-0 tabular-nums"
          >
            {toolCount} tool{toolCount !== 1 ? "s" : ""}
          </Badge>

          {/* Command/URL preview */}
          {server.url ? (
            <a
              href={server.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-micro font-mono text-muted-foreground/50 hover:text-chart-1 truncate max-w-[320px] hidden sm:inline transition-colors"
              title={server.url}
            >
              {server.url}
            </a>
          ) : server.command ? (
            <span className="text-micro font-mono text-muted-foreground/50 truncate max-w-[320px] hidden sm:inline">
              {server.command}
            </span>
          ) : null}

          {/* Env key badges */}
          <div className="hidden md:flex items-center gap-1 shrink-0">
            {envKeys.slice(0, 3).map((k) => (
              <Badge
                key={k}
                variant="outline"
                className="text-micro gap-0.5 font-mono text-muted-foreground/60"
              >
                <Key size={8} />
                {k}
              </Badge>
            ))}
            {envKeys.length > 3 && (
              <Badge
                variant="outline"
                className="text-micro text-muted-foreground/60"
              >
                +{envKeys.length - 3}
              </Badge>
            )}
          </div>

          {onToggle && (
            statusPill
          )}
    </div>
  );
}
