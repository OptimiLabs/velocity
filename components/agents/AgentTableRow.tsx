"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Pencil,
  Trash2,
  Wrench,
  Cpu,
  Play,
  Copy,
  Sparkles,
  GitBranch,
  Store,
} from "lucide-react";
import { AgentIcon } from "@/lib/agents/categories";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import { cn } from "@/lib/utils";
import { estimateTokensFromText } from "@/lib/marketplace/token-estimate";
import type { Agent } from "@/types/agent";
import {
  getAgentModelDisplay,
  INHERIT_MODEL_HELP,
} from "@/lib/agents/model-display";

interface AgentTableRowProps {
  agent: Agent;
  selected?: boolean;
  onToggleSelect?: () => void;
  onEdit: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
  onDuplicate?: (agent: Agent) => void;
  onToggleEnabled?: (agent: Agent) => void;
}

export function AgentTableRow({
  agent,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleEnabled,
}: AgentTableRowProps) {
  const isDisabled = agent.enabled === false;
  const promptText = agent.prompt ?? "";
  const tokenEstimate = estimateTokensFromText(promptText);
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

  return (
    <tr
      className={cn(
        "border-b border-border/30 hover:bg-muted/30 transition-colors group cursor-pointer",
        isDisabled && "opacity-55",
      )}
      onClick={() => onEdit(agent)}
    >
      {/* Checkbox */}
      {onToggleSelect && (
        <td className="py-2 px-3 w-8" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onToggleSelect}
            className="accent-primary h-3.5 w-3.5 cursor-pointer"
          />
        </td>
      )}

      {/* Icon + Name */}
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          <AgentIcon agent={agent} size={12} className="shrink-0" />
          {agent.source === "marketplace" && (
            <Store size={9} className="text-blue-400/60 shrink-0 -ml-1" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "text-[12px] font-medium truncate",
                  isDisabled && "line-through decoration-text-quaternary",
                )}
              >
                {agent.name}
              </span>
              {onToggleEnabled && (
                <StatusPill
                  enabled={!isDisabled}
                  onToggle={() => onToggleEnabled(agent)}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  title={isDisabled ? "Enable agent" : "Disable agent"}
                />
              )}
              {agent.source === "preset" && (
                <Badge variant="outline" className="text-micro font-normal shrink-0 h-4 px-1">
                  Built-in
                </Badge>
              )}
            </div>
            {agent.description && (
              <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                {agent.description}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Model */}
      <td className="py-2 px-3">
        <div className="flex flex-col items-start gap-0.5">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant={modelInfo.isInherited ? "secondary" : "outline"}
                  className="text-meta gap-1"
                >
                  <Cpu size={9} />
                  {modelInfo.isInherited ? "inherit" : modelInfo.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {modelInfo.isInherited ? (
                  INHERIT_MODEL_HELP
                ) : modelInfo.version && modelInfo.version !== modelInfo.label ? (
                  <span>
                    Version: <span className="font-medium">{modelInfo.version}</span>
                  </span>
                ) : (
                  <span>
                    Model: <span className="font-medium">{modelInfo.label}</span>
                  </span>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {!modelInfo.isInherited &&
            modelInfo.version &&
            modelInfo.version !== modelInfo.label && (
              <span className="text-[11px] text-muted-foreground">
                {modelInfo.version}
              </span>
            )}
        </div>
      </td>

      {/* Effort */}
      <td className="py-2 px-3">
        {agent.effort ? (
          <span className="text-[12px] text-muted-foreground capitalize">
            {agent.effort}
          </span>
        ) : (
          <span className="text-[12px] text-muted-foreground">-</span>
        )}
      </td>

      {/* Tools */}
      <td className="py-2 px-3">
        {agent.tools && agent.tools.length > 0 ? (
          <Badge variant="outline" className="text-meta gap-1">
            <Wrench size={9} />
            {agent.tools.length}
          </Badge>
        ) : (
          <span className="text-[12px] text-muted-foreground">-</span>
        )}
      </td>

      {/* Skills */}
      <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
        {(agent.skills?.length ?? 0) > 0 ? (
          <div className="flex items-center gap-1">
            {agent.skills?.slice(0, 2).map((skill) => (
              <Link key={skill} href={`/skills?search=${encodeURIComponent(skill)}`}>
                <Badge variant="violet" className="text-meta gap-1 hover:opacity-80 transition-opacity cursor-pointer">
                  <Sparkles size={9} />/{skill}
                </Badge>
              </Link>
            ))}
            {(agent.skills?.length ?? 0) > 2 && (
              <Badge variant="outline" className="text-micro">
                +{agent.skills!.length - 2}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-[12px] text-muted-foreground">-</span>
        )}
      </td>

      {/* Workflows */}
      <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
        {(agent.workflowNames?.length ?? 0) > 0 ? (
          <div className="flex items-center gap-1">
            {agent.workflowNames?.slice(0, 2).map((wf) => (
              <Link key={wf} href={`/workflows?search=${encodeURIComponent(wf)}`}>
                <Badge variant="blue" className="text-meta gap-1 hover:opacity-80 transition-opacity cursor-pointer">
                  <GitBranch size={9} />
                  {wf}
                </Badge>
              </Link>
            ))}
            {(agent.workflowNames?.length ?? 0) > 2 && (
              <Badge variant="outline" className="text-micro">
                +{agent.workflowNames!.length - 2}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-[12px] text-muted-foreground">-</span>
        )}
      </td>

      {/* Token estimate */}
      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
        {promptText.trim() ? formatTokens(tokenEstimate) : "-"}
      </td>

      {/* Runs */}
      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
        {agent.usageCount == null ? "-" : agent.usageCount}
      </td>

      {/* Avg Cost */}
      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
        {agent.avgCost ? formatCost(agent.avgCost) : "-"}
      </td>

      {/* Last Used */}
      <td className="py-2 px-3 text-right text-muted-foreground">
        {agent.lastUsed
          ? formatDistanceToNow(agent.lastUsed, { addSuffix: true })
          : "-"}
      </td>

      {/* Actions */}
      <td className="py-2 px-3">
        <div
          className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <Link href={launchHref}>
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
            onClick={() => onDelete(agent)}
          >
            <Trash2 size={11} />
          </Button>
        </div>
      </td>
    </tr>
  );
}
