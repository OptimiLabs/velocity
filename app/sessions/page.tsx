"use client";

import { Suspense } from "react";
import { SessionsTab } from "@/components/workspace/SessionsTab";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";

function WorkspaceContent() {
  return (
    <PageContainer>
      <PageScaffold
        title="Sessions"
        subtitle="Browse local coding sessions, filter by provider/project/cost, and compare runs over time."
      >
        <div className="rounded-2xl border border-border/70 bg-card/95 shadow-sm p-4 sm:p-5">
          <SessionsTab />
        </div>
      </PageScaffold>
    </PageContainer>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-64" />
        </div>
      }
    >
      <WorkspaceContent />
    </Suspense>
  );
}
