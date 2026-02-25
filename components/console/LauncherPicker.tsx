"use client";

import { useState, useMemo } from "react";
import { Search, Bot, Workflow, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAgents } from "@/hooks/useAgents";
import { useWorkflows } from "@/hooks/useWorkflows";
import type { Agent } from "@/types/agent";

interface LauncherPickerProps {
  mode: "workflow" | "agent";
  open: boolean;
  onClose: () => void;
  onSelectWorkflow: (id: string) => void;
  onSelectAgent: (agent: {
    name: string;
    prompt: string;
    model?: string;
    effort?: "low" | "medium" | "high";
  }) => void;
}

export function LauncherPicker({
  mode,
  open,
  onClose,
  onSelectWorkflow,
  onSelectAgent,
}: LauncherPickerProps) {
  const [search, setSearch] = useState("");
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: workflows, isLoading: workflowsLoading } = useWorkflows();

  const isLoading = mode === "agent" ? agentsLoading : workflowsLoading;

  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    const q = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q),
    );
  }, [agents, search]);

  const filteredWorkflows = useMemo(() => {
    if (!workflows) return [];
    const q = search.toLowerCase();
    return workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.description?.toLowerCase().includes(q),
    );
  }, [workflows, search]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSearch("");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            {mode === "agent" ? (
              <>
                <Bot className="h-4 w-4" /> Launch Agent
              </>
            ) : (
              <>
                <Workflow className="h-4 w-4" /> Launch Workflow
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={`Search ${mode}s...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto -mx-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-xs">Loading...</span>
            </div>
          ) : mode === "agent" ? (
            filteredAgents.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                No agents found
              </div>
            ) : (
              filteredAgents.map((agent: Agent) => (
                <button
                  key={agent.name}
                  onClick={() => onSelectAgent(agent)}
                  className="w-full flex items-start gap-3 px-3 py-2 rounded-md hover:bg-accent text-left transition-colors"
                >
                  <div className="mt-0.5">
                    {agent.color ? (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: agent.color }}
                      />
                    ) : (
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {agent.name}
                    </div>
                    {agent.description && (
                      <div className="text-micro text-muted-foreground truncate">
                        {agent.description}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      {agent.model && (
                        <span className="text-micro text-muted-foreground/70">
                          {agent.model}
                        </span>
                      )}
                      {agent.source && (
                        <span className="text-micro text-muted-foreground/50">
                          {agent.source}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )
          ) : filteredWorkflows.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              No workflows found
            </div>
          ) : (
            filteredWorkflows.map((wf) => (
              <button
                key={wf.id}
                onClick={() => onSelectWorkflow(wf.id)}
                className="w-full flex items-start gap-3 px-3 py-2 rounded-md hover:bg-accent text-left transition-colors"
              >
                <Workflow className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{wf.name}</div>
                  {wf.description && (
                    <div className="text-micro text-muted-foreground truncate">
                      {wf.description}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-micro text-muted-foreground/50">
                      {wf.nodes.length} step{wf.nodes.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
