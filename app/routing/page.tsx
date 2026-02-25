"use client";

import { Suspense } from "react";
import { RoutingWorkspace } from "@/components/routing/RoutingWorkspace";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { useRoutingStore } from "@/stores/routingStore";

function KnowledgePageContent() {
  const isFullscreen = useRoutingStore((s) => s.isFullscreen);

  if (isFullscreen) {
    return (
      <div className="h-full min-h-0 bg-background">
        <RoutingWorkspace />
      </div>
    );
  }

  return (
    <PageContainer fullHeight>
      <PageScaffold
        title="Routing"
        subtitle="Inspect provider routing paths, entrypoints, and graph relationships across your local codebase."
        className="flex min-h-0 flex-1 flex-col"
        bodyClassName="flex-1 min-h-0"
      >
        <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-sm">
          <RoutingWorkspace />
        </div>
      </PageScaffold>
    </PageContainer>
  );
}

export default function KnowledgePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-6">
          <Skeleton className="h-10" />
          <Skeleton className="h-64" />
        </div>
      }
    >
      <KnowledgePageContent />
    </Suspense>
  );
}
