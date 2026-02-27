"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pencil,
  Trash2,
  Wrench,
  Cpu,
  Play,
  Copy,
  Zap,
  GitMerge,
  Store,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentIcon } from "@/lib/agents/categories";
import { formatCost } from "@/lib/cost/calculator";
import { formatDistanceToNow } from "date-fns";
import type { Agent } from "@/types/agent";
import { getAgentModelDisplay } from "@/lib/agents/model-display";

interface AgentCardProps {
  agent: Agent;
  onEdit: (agent: Agent) => void;
  onDelete: (name: string) => void;
  onDuplicate?: (agent: Agent) => void;
}

export function AgentCard({
  agent,
  onEdit,
  onDelete,
  onDuplicate,
}: AgentCardProps) {
  const router = useRouter();
  const modelInfo = getAgentModelDisplay(agent.model, agent.provider);
  const launchParams = new URLSearchParams({
    agent: agent.name,
  });
  if (agent.provider) {
    launchParams.set("provider", agent.provider);
  }
  if (agent.scope === "project" && agent.projectPath) {
    launchParams.set("projectPath", agent.projectPath);
  }
  const launchHref = `/?${launchParams.toString()}`;

  // Collect all badges, then truncate to a visible limit
  const badges: { key: string; content: React.ReactNode }[] = [];
  if (!modelInfo.isInherited) {
    badges.push({
      key: "model",
      content: (
        <Badge
          variant="outline"
          className="text-meta gap-1"
          title={
            modelInfo.version && modelInfo.version !== modelInfo.label
              ? `Version: ${modelInfo.version}`
              : undefined
          }
        >
          <Cpu size={9} />
          {modelInfo.label}
        </Badge>
      ),
    });
    if (modelInfo.version && modelInfo.version !== modelInfo.label) {
      badges.push({
        key: "model-version",
        content: (
          <Badge variant="outline" className="text-micro font-mono">
            {modelInfo.version}
          </Badge>
        ),
      });
    }
  }
  if (agent.tools && agent.tools.length > 0) {
    badges.push({
      key: "tools",
      content: (
        <Badge variant="outline" className="text-meta gap-1">
          <Wrench size={9} />
          {agent.tools.length} tools
        </Badge>
      ),
    });
  }
  for (const skill of agent.skills ?? []) {
    badges.push({
      key: `skill-${skill}`,
      content: (
        <Link href={`/skills?search=${encodeURIComponent(skill)}`} onClick={(e) => e.stopPropagation()}>
          <Badge
            variant="violet"
            className="text-meta gap-1 hover:opacity-80 transition-opacity cursor-pointer"
          >
            <Zap size={9} />
            /{skill}
          </Badge>
        </Link>
      ),
    });
  }
  for (const wf of agent.workflowNames ?? []) {
    badges.push({
      key: `wf-${wf}`,
      content: (
        <Link href={`/workflows?search=${encodeURIComponent(wf)}`} onClick={(e) => e.stopPropagation()}>
          <Badge
            variant="blue"
            className="text-meta gap-1 hover:opacity-80 transition-opacity cursor-pointer"
          >
            <GitMerge size={9} />
            {wf}
          </Badge>
        </Link>
      ),
    });
  }
  for (const tag of agent.tags ?? []) {
    badges.push({
      key: `tag-${tag}`,
      content: (
        <Badge variant="secondary" className="text-micro">
          {tag}
        </Badge>
      ),
    });
  }

  const MAX_VISIBLE_BADGES = 4;
  const visibleBadges = badges.slice(0, MAX_VISIBLE_BADGES);
  const overflowCount = badges.length - MAX_VISIBLE_BADGES;

  return (
    <Card className="bg-card card-hover-glow group cursor-pointer" onClick={() => onEdit(agent)}>
      <CardHeader className="p-2.5 pb-0 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <AgentIcon agent={agent} size={13} className="shrink-0" />
            <span className="font-mono text-xs font-medium truncate">{agent.name}</span>
            {agent.source === "marketplace" && (
              <Store size={9} className="text-blue-400/50 shrink-0" />
            )}
            {agent.scope === "project" && (
              <Badge variant="outline" className="text-micro font-normal border-chart-2/30 text-chart-2 h-4 px-1">
                Project
              </Badge>
            )}
          </div>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 text-success"
              onClick={() => router.push(launchHref)}
            >
              <Play size={10} />
            </Button>
            {onDuplicate && (
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onDuplicate(agent)}>
                <Copy size={10} />
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onEdit(agent)}>
              <Pencil size={10} />
            </Button>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive" onClick={() => onDelete(agent.name)}>
              <Trash2 size={10} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2.5 pb-2.5 pt-1.5">
        {agent.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 mb-1.5">
            {agent.description}
          </p>
        )}

        {visibleBadges.length > 0 && (
          <div className="flex items-center gap-1 overflow-hidden">
            {visibleBadges.map((b) => (
              <span key={b.key} className="shrink-0">{b.content}</span>
            ))}
            {overflowCount > 0 && (
              <span className="text-[10px] text-text-tertiary shrink-0">
                +{overflowCount}
              </span>
            )}
          </div>
        )}

        {(agent.usageCount || agent.avgCost || agent.lastUsed) && (
          <div className="border-t border-border/30 pt-2 mt-2 flex items-center gap-3 text-muted-foreground">
            {agent.usageCount != null && (
              <span className="flex items-center gap-1 text-[11px] tabular-nums">
                <Activity size={10} />
                {agent.usageCount}
              </span>
            )}
            {agent.avgCost != null && agent.avgCost > 0 && (
              <span className="text-[11px] tabular-nums">
                {formatCost(agent.avgCost)} avg
              </span>
            )}
            {agent.lastUsed && (
              <span className="text-[11px] tabular-nums ml-auto">
                {formatDistanceToNow(agent.lastUsed, { addSuffix: true })}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
