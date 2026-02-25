"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { AgentsTab } from "@/components/agents/AgentsTab";
import { useProviderScopeStore } from "@/stores/providerScopeStore";

function AgentsPageContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search") ?? undefined;
  const providerScope = useProviderScopeStore((s) => s.providerScope);

  return (
    <PageContainer>
      <PageScaffold
        title="Agents"
        subtitle="Manage reusable agents, sort by usage and cost, and build or edit agent definitions without leaving the dashboard."
      >
        <div className="rounded-2xl border border-border/70 bg-card/95 shadow-sm overflow-hidden">
          <AgentsTab initialSearch={initialSearch} provider={providerScope} />
        </div>
      </PageScaffold>
    </PageContainer>
  );
}

export default function AgentsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-6">
          <div className="h-10 bg-muted rounded animate-pulse" />
          <div className="h-64 bg-muted rounded animate-pulse" />
        </div>
      }
    >
      <AgentsPageContent />
    </Suspense>
  );
}
