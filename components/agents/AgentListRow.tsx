"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pencil,
  Trash2,
  Wrench,
  Cpu,
  Play,
  Copy,
  BarChart3,
  Zap,
  GitMerge,
  FileText,
  Store,
} from "lucide-react";
import { AgentIcon } from "@/lib/agents/categories";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Link from "next/link";
import type { Agent } from "@/types/agent";

interface AgentListRowProps {
  agent: Agent;
  onEdit: (agent: Agent) => void;
  onDelete: (name: string) => void;
  onDuplicate?: (agent: Agent) => void;
}

export function AgentListRow({
  agent,
  onEdit,
  onDelete,
  onDuplicate,
}: AgentListRowProps) {
  return (
    <div
      className="group flex items-center gap-3 px-3 py-2 border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={() => onEdit(agent)}
    >
      {/* Category icon */}
      <AgentIcon agent={agent} size={12} className="shrink-0" />

      {/* Source indicator */}
      {agent.source === "marketplace" && (
        <Store size={9} className="text-blue-400/60 shrink-0 -ml-1.5" />
      )}

      {/* Name */}
      <span className="font-mono text-xs font-medium w-40 truncate shrink-0">
        {agent.name}
      </span>

      {/* Description */}
      <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
        {agent.description || "No description"}
      </span>

      {/* Model badge */}
      {agent.model && (
        <Badge variant="outline" className="text-meta gap-1 shrink-0">
          <Cpu size={9} />
          {agent.model}
        </Badge>
      )}

      {/* Tools badge */}
      {agent.tools && agent.tools.length > 0 && (
        <Badge variant="outline" className="text-meta gap-1 shrink-0">
          <Wrench size={9} />
          {agent.tools.length} tools
        </Badge>
      )}

      {/* Tags (max 2) */}
      {agent.tags?.slice(0, 2).map((tag) => (
        <Badge key={tag} variant="secondary" className="text-micro shrink-0">
          {tag}
        </Badge>
      ))}

      {/* Skill trigger badges */}
      {agent.skills?.slice(0, 2).map((skill) => (
        <Link key={skill} href={`/skills?search=${encodeURIComponent(skill)}`} onClick={(e) => e.stopPropagation()}>
          <Badge
            variant="violet"
            className="text-meta gap-1 shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
          >
            <Zap size={9} />
            /{skill}
          </Badge>
        </Link>
      ))}

      {/* Workflow badges */}
      {agent.workflowNames?.slice(0, 2).map((wf) => (
        <Link key={wf} href={`/workflows?search=${encodeURIComponent(wf)}`} onClick={(e) => e.stopPropagation()}>
          <Badge
            variant="blue"
            className="text-meta gap-1 shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
          >
            <GitMerge size={9} />
            {wf}
          </Badge>
        </Link>
      ))}

      {/* File path tooltip */}
      {agent.filePath && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="text-muted-foreground/60 hover:text-muted-foreground transition-colors shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(agent.filePath);
                }}
              >
                <FileText size={11} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="font-mono text-xs">
              {agent.filePath.replace(/^\/Users\/[^/]+/, "~")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Usage count */}
      {agent.usageCount !== undefined && agent.usageCount > 0 && (
        <span className="text-meta text-muted-foreground tabular-nums shrink-0 flex items-center gap-1">
          <BarChart3 size={9} />
          {agent.usageCount} runs
        </span>
      )}

      {/* Actions (visible on hover) */}
      { }
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
        <Link href={`/?agent=${encodeURIComponent(agent.name)}`}>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-success"
          >
            <Play size={11} />
          </Button>
        </Link>
        {onDuplicate && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => onDuplicate(agent)}
          >
            <Copy size={11} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => onEdit(agent)}
        >
          <Pencil size={11} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-destructive"
          onClick={() => onDelete(agent.name)}
        >
          <Trash2 size={11} />
        </Button>
      </div>
    </div>
  );
}
