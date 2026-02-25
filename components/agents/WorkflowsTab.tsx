"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/hooks/useConfirm";
import { Plus } from "lucide-react";
import { WorkflowList } from "@/components/workflows/WorkflowList";
import {
  useWorkflows,
  useCreateWorkflow,
  useDeleteWorkflow,
} from "@/hooks/useWorkflows";

export function WorkflowsTab() {
  const router = useRouter();
  const { confirm } = useConfirm();

  const { data: workflows = [], isLoading } = useWorkflows();
  const createMutation = useCreateWorkflow();
  const deleteMutation = useDeleteWorkflow();

  const handleSelect = useCallback(
    (id: string) => {
      router.push(`/workflows/${id}`);
    },
    [router],
  );

  const handleCreate = useCallback(() => {
    createMutation.mutate(
      { name: "New Workflow" },
      { onSuccess: (wf) => router.push(`/workflows/${wf.id}`) },
    );
  }, [createMutation, router]);

  const handleDelete = useCallback(
    async (id: string) => {
      const ok = await confirm({ title: "Delete this workflow?" });
      if (ok) {
        deleteMutation.mutate(id);
      }
    },
    [confirm, deleteMutation],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-detail">{workflows.length} workflows</div>
        <button
          onClick={handleCreate}
          className="inline-flex items-center gap-2 px-3 h-7 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          New Workflow
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <WorkflowList
          workflows={workflows}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
