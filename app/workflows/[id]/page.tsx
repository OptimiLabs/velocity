"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { WorkflowCanvasBuilder } from "@/components/workflows/WorkflowCanvasBuilder";
import { Skeleton } from "@/components/ui/skeleton";

function WorkflowBuilderPage() {
  const params = useParams<{ id: string }>();
  return <WorkflowCanvasBuilder workflowId={params.id} />;
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-full p-6 gap-4">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-64 flex-1" />
        </div>
      }
    >
      <WorkflowBuilderPage />
    </Suspense>
  );
}
