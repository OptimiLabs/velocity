"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DirectoryPicker } from "@/components/console/DirectoryPicker";
import { toast } from "sonner";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";
import { parseInstanceId } from "@/lib/workflow/instance";

interface CanvasEdge {
  id: string;
  source: string;
  target: string;
}

interface SaveWorkflowDialogProps {
  open: boolean;
  onClose: () => void;
  canvasNodes: { id: string; agentName?: string; position: { x: number; y: number } }[];
  canvasEdges: CanvasEdge[];
  agents: { name: string; model?: string }[];
  onSave: (data: {
    name: string;
    description: string;
    cwd: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  }) => void;
  existingName?: string;
  existingDescription?: string;
  existingCwd?: string;
  existingWorkflowNodes?: WorkflowNode[];
}

export function SaveWorkflowDialog({
  open,
  onClose,
  canvasNodes,
  canvasEdges,
  agents,
  onSave,
  existingName,
  existingDescription,
  existingCwd,
  existingWorkflowNodes,
}: SaveWorkflowDialogProps) {
  const [name, setName] = useState(existingName || "");
  const [description, setDescription] = useState(existingDescription || "");
  const [cwd, setCwd] = useState(existingCwd || "");

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Workflow name is required");
      return;
    }

    const agentMap = new Map(agents.map((a) => [a.name, a]));

    // Convert canvas nodes to WorkflowNodes
    const existingNodeIds = new Set(
      existingWorkflowNodes?.map((n) => n.id) ?? [],
    );
    const nodes: WorkflowNode[] = canvasNodes
      .filter((cn) => {
        // Include nodes that participate in edges OR have existing workflow metadata
        return (
          canvasEdges.some(
            (e) => e.source === cn.id || e.target === cn.id,
          ) || existingNodeIds.has(cn.id)
        );
      })
      .map((cn) => {
        const agentName = cn.agentName ?? parseInstanceId(cn.id);
        const agent = agentMap.get(agentName);
        const incomingEdges = canvasEdges.filter((e) => e.target === cn.id);
        const existingNode = existingWorkflowNodes?.find(
          (n) => n.id === cn.id,
        );
        return {
          id: cn.id,
          label: existingNode?.label ?? agentName,
          taskDescription: existingNode?.taskDescription ?? "",
          agentName,
          model: agent?.model,
          status: "ready" as const,
          position: cn.position,
          dependsOn: incomingEdges.map((e) => e.source),
        };
      });

    // Convert canvas edges to WorkflowEdges
    const edges: WorkflowEdge[] = canvasEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));

    onSave({ name: name.trim(), description, cwd, nodes, edges });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-sm">Save Workflow</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-meta uppercase tracking-wider text-muted-foreground/50">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-workflow"
              className="h-8 text-xs mt-1"
              autoFocus
            />
          </div>

          <div>
            <label className="text-meta uppercase tracking-wider text-muted-foreground/50">
              Description
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="h-8 text-xs mt-1"
            />
          </div>

          <div>
            <label className="text-meta uppercase tracking-wider text-muted-foreground/50">
              Working Directory
            </label>
            <div className="mt-1">
              <DirectoryPicker value={cwd} onChange={setCwd} compact />
            </div>
          </div>

          <div className="text-xs text-muted-foreground/50">
            {canvasEdges.length} edge{canvasEdges.length !== 1 && "s"}{" "}
            connecting{" "}
            {
              new Set([
                ...canvasEdges.map((e) => e.source),
                ...canvasEdges.map((e) => e.target),
              ]).size
            }{" "}
            agents
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Save Workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
