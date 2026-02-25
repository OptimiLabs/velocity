"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { WorkflowsList } from "@/components/workflows/WorkflowsList";

function WorkflowsPageContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search") ?? undefined;

  return (
    <PageContainer fullHeight>
      <PageScaffold
        title="Workflows"
        subtitle="Build reusable multi-step workflows and launch automation flows from a single workspace."
        className="flex min-h-0 flex-1 flex-col"
        bodyClassName="flex-1 min-h-0"
      >
        <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-sm">
          <WorkflowsList initialSearch={initialSearch} />
        </div>
      </PageScaffold>
    </PageContainer>
  );
}

export default function WorkflowsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-6">
          <div className="h-10 bg-muted rounded animate-pulse" />
          <div className="h-64 bg-muted rounded animate-pulse" />
        </div>
      }
    >
      <WorkflowsPageContent />
    </Suspense>
  );
}
