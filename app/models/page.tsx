"use client";

import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { ModelLandscape } from "@/components/models/ModelLandscape";

export default function ModelsPage() {
  return (
    <PageContainer>
      <PageScaffold
        title="Models"
        subtitle="Compare pricing, benchmarks, and provider capabilities across supported models."
      >
        <div className="rounded-2xl border border-border/70 bg-card/95 shadow-sm p-4 sm:p-5">
          <ModelLandscape />
        </div>
      </PageScaffold>
    </PageContainer>
  );
}
