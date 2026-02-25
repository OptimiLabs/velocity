"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import type { Project } from "@/types/session";

export function ProjectsTab() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async (): Promise<Project[]> => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      return json.projects ?? json;
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        {projects?.length || 0} projects
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {projects?.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`}>
            <Card className="card-hover-glow cursor-pointer bg-card">
              <CardContent className="p-4">
                <div className="flex items-start gap-2 mb-2">
                  <FolderOpen
                    size={14}
                    className="text-muted-foreground mt-0.5"
                  />
                  <span className="text-sm font-medium truncate">{p.name}</span>
                </div>
                <div className="flex items-center gap-4 text-detail text-muted-foreground">
                  <span>{p.session_count} sessions</span>
                  <span>{formatTokens(p.total_tokens)} tokens</span>
                  <span className="ml-auto tabular-nums">
                    {formatCost(p.total_cost)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
