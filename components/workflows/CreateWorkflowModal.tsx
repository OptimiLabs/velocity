"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAgents } from "@/hooks/useAgents";
import { useCreateWorkflow } from "@/hooks/useWorkflows";
import { useWorkflowCreationStore } from "@/stores/workflowCreationStore";
import { useProviderScopeStore } from "@/stores/providerScopeStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Bot, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateWorkflowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "manual" | "ai";
}

export function CreateWorkflowModal({
  open,
  onOpenChange,
  mode = "manual",
}: CreateWorkflowModalProps) {
  const router = useRouter();
  const providerScope = useProviderScopeStore((s) => s.providerScope);
  const { data: agents = [] } = useAgents(providerScope);
  const createWorkflow = useCreateWorkflow();
  const setPendingAIIntent = useWorkflowCreationStore(
    (s) => s.setPendingAIIntent,
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentMode, setAgentMode] = useState<"existing" | "ai-create">(
    "ai-create",
  );
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());

  const toggleAgent = (agentName: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentName)) {
        next.delete(agentName);
      } else {
        next.add(agentName);
      }
      return next;
    });
  };

  const handleCreate = () => {
    if (mode === "manual") {
      if (!name.trim()) return;

      createWorkflow.mutate(
        {
          provider: providerScope,
          name: name.trim(),
          description: description.trim(),
          nodes: [],
          edges: [],
        },
        {
          onSuccess: (wf) => {
            if (!wf?.id) {
              console.error("Workflow creation returned no ID");
              return;
            }
            onOpenChange(false);
            resetForm();
            router.push(`/workflows/${wf.id}`);
          },
          onError: (err) => {
            console.error("Workflow creation failed:", err);
          },
        },
      );
    } else {
      // AI mode
      if (!prompt.trim()) return;

      const workflowName = name.trim() || "Untitled Workflow";

      setPendingAIIntent({
        prompt: prompt.trim(),
        agentMode,
        selectedAgents:
          agentMode === "existing" ? Array.from(selectedAgents) : undefined,
      });

      createWorkflow.mutate(
        {
          provider: providerScope,
          name: workflowName,
          description: prompt.trim(),
          nodes: [],
          edges: [],
        },
        {
          onSuccess: (wf) => {
            if (!wf?.id) {
              console.error("Workflow creation returned no ID");
              return;
            }
            onOpenChange(false);
            resetForm();
            router.push(`/workflows/${wf.id}`);
          },
          onError: (err) => {
            console.error("Workflow creation failed:", err);
          },
        },
      );
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setPrompt("");
    setAgentMode("ai-create");
    setSelectedAgents(new Set());
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) resetForm();
    onOpenChange(o);
  };

  const enabledAgents = agents.filter((a) => a.enabled !== false);

  const isValid =
    mode === "manual" ? name.trim().length > 0 : prompt.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {mode === "ai" ? (
              <span className="flex items-center gap-2">
                <Sparkles size={16} className="text-primary" />
                Build with AI
              </span>
            ) : (
              "New Workflow"
            )}
          </DialogTitle>
          <DialogDescription>
            {mode === "ai"
              ? "Describe what you want to build and AI will generate a workflow plan."
              : "Name your workflow and start building in the canvas."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {mode === "ai" ? (
            <>
              {/* Prompt */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  What should this workflow do?
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Review all PRs, run tests, deploy to staging if they pass..."
                  className="w-full min-h-[120px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none resize-y"
                  autoFocus
                />
              </div>

              {/* Name (optional) */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Name{" "}
                  <span className="text-muted-foreground/50">(optional)</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Auto-derived from prompt if blank"
                  className="h-9 text-sm"
                />
              </div>

              {/* Agent mode */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Agents
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAgentMode("ai-create")}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors text-left",
                      agentMode === "ai-create"
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-border/80",
                    )}
                  >
                    <div>Let AI decide agents</div>
                    <div className="text-[10px] font-normal text-muted-foreground/60 mt-0.5">
                      AI creates task steps automatically
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentMode("existing")}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors text-left",
                      agentMode === "existing"
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-border/80",
                    )}
                  >
                    <div>Use existing agents</div>
                    <div className="text-[10px] font-normal text-muted-foreground/60 mt-0.5">
                      Pick agents to assign tasks to
                    </div>
                  </button>
                </div>
              </div>

              {/* Agent picker (only when "existing" mode) */}
              {agentMode === "existing" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Select agents{" "}
                    {selectedAgents.size > 0 && (
                      <span className="text-muted-foreground/50">
                        ({selectedAgents.size} selected)
                      </span>
                    )}
                  </label>
                  <div className="rounded-md border border-border max-h-[200px] overflow-y-auto">
                    {enabledAgents.length > 0 ? (
                      enabledAgents.map((agent) => {
                        const isSelected = selectedAgents.has(agent.name);
                        return (
                          <button
                            key={agent.name}
                            type="button"
                            onClick={() => toggleAgent(agent.name)}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-b border-border/30 last:border-b-0",
                              isSelected ? "bg-primary/5" : "hover:bg-muted/40",
                            )}
                          >
                            <div
                              className={cn(
                                "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                isSelected
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-border",
                              )}
                            >
                              {isSelected && <Check size={10} />}
                            </div>
                            <Bot
                              size={12}
                              className="text-muted-foreground shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-mono block truncate">
                                {agent.name}
                              </span>
                              {agent.description && (
                                <span className="text-xs text-muted-foreground/60 block truncate">
                                  {agent.description}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground/60 p-3 text-center">
                        No agents available
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Manual mode: Name + Description only */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Code Review Pipeline"
                  className="h-9 text-sm"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this workflow should accomplish..."
                  className="w-full min-h-[120px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none resize-y"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8"
            onClick={handleCreate}
            disabled={!isValid || createWorkflow.isPending}
          >
            {createWorkflow.isPending ? (
              <Loader2 size={12} className="animate-spin mr-1.5" />
            ) : null}
            {mode === "ai" ? "Create & Generate" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
