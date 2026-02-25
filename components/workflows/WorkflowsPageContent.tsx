"use client";

import { useCallback } from "react";
import { useConfirm } from "@/hooks/useConfirm";
import { useRouter } from "next/navigation";
import {
  useWorkflows,
  useCreateWorkflow,
  useDeleteWorkflow,
  useDuplicateWorkflow,
} from "@/hooks/useWorkflows";
import { WorkflowList } from "./WorkflowList";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";

export function WorkflowsPageContent() {
  const { confirm } = useConfirm();
  const router = useRouter();

  const { data: workflows = [] } = useWorkflows();
  const createMutation = useCreateWorkflow();
  const deleteMutation = useDeleteWorkflow();
  const duplicateMutation = useDuplicateWorkflow();

  const handleCreate = useCallback(async () => {
    const created = await createMutation.mutateAsync({ name: "New Workflow" });
    router.push(`/workflows/${created.id}`);
  }, [createMutation, router]);

  const handleSelect = useCallback(
    (id: string) => {
      router.push(`/workflows/${id}`);
    },
    [router],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!(await confirm({ title: "Delete this workflow?" }))) return;
      await deleteMutation.mutateAsync(id);
    },
    [confirm, deleteMutation],
  );

  const handleDuplicate = useCallback(
    async (id: string) => {
      const copy = await duplicateMutation.mutateAsync(id);
      router.push(`/workflows/${copy.id}`);
    },
    [duplicateMutation, router],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <PageContainer>
          <PageHeader title="Workflows" count={workflows.length} />
          <WorkflowList
            workflows={workflows}
            onSelect={handleSelect}
            onCreate={handleCreate}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
          />
        </PageContainer>
      </div>
    </div>
  );
}
