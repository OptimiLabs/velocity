"use client";

import { Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import type { MCPToolEntry, MCPUsageMap } from "@/hooks/useMCP";

interface MCPToolListProps {
  tools: MCPToolEntry[];
  usageMap: MCPUsageMap;
  serverName: string;
}

export function MCPToolList({ tools, usageMap, serverName }: MCPToolListProps) {
  if (tools.length === 0) {
    return (
      <div className="text-xs text-muted-foreground/60 py-2">
        No tools reported by this server.
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {tools.map((tool) => {
        const key = `mcp__${serverName}__${tool.name}`;
        const usage = usageMap[key];
        return (
          <div
            key={tool.name}
            className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-muted/50 transition-colors"
          >
            <Wrench size={11} className="text-chart-2 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="text-xs font-mono font-medium">{tool.name}</span>
              {tool.description && (
                <p className="text-meta text-muted-foreground/60 line-clamp-2">
                  {tool.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {usage && usage.totalCalls > 0 && (
                <Badge
                  variant="outline"
                  className="text-micro shrink-0 tabular-nums"
                >
                  {usage.totalCalls} call{usage.totalCalls !== 1 ? "s" : ""}
                </Badge>
              )}
              {usage?.lastUsed && (
                <span className="text-micro text-muted-foreground/50 tabular-nums whitespace-nowrap">
                  {formatDistanceToNow(new Date(usage.lastUsed), {
                    addSuffix: true,
                  })}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
