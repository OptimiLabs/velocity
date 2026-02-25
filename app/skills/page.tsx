"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { ScopeFilterDropdown } from "@/components/ui/scope-filter-dropdown";
import { SearchField } from "@/components/ui/search-field";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { SkillsTab } from "@/components/tools/SkillsTab";
import { useTools, useInvalidateTools } from "@/hooks/useTools";
import type { ScopeFilter } from "@/types/scope";
import { useProviderScopeStore } from "@/stores/providerScopeStore";

function SkillsPageContent() {
  const searchParams = useSearchParams();
  const providerScope = useProviderScopeStore((s) => s.providerScope);
  const { data: tools = [], isLoading } = useTools(providerScope);
  const invalidateTools = useInvalidateTools(providerScope);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [showNewSkill, setShowNewSkill] = useState(false);

  const pluginSkills = tools.filter((t) => t.type === "skill");

  return (
    <PageContainer>
      <PageScaffold
        title="Skills"
        subtitle="Create, import, and organize reusable skills across built-in, plugin, and archived scopes."
      >
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-sm">
          <div className="border-b border-border/40 bg-muted/20 px-4 py-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <SearchField
                  placeholder="Filter skills..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  inputSize="sm"
                  containerClassName="w-full sm:w-72 md:w-80"
                />
                <ScopeFilterDropdown
                  value={scopeFilter}
                  onChange={setScopeFilter}
                  showPlugin
                  showArchived
                />
                <span className="rounded-md border border-border/50 bg-background px-2 py-1 text-[11px] text-muted-foreground tabular-nums">
                  {pluginSkills.length} plugin skills
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setShowNewSkill((v) => !v)}
                >
                  <Plus size={12} /> New Skill
                </Button>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            {isLoading ? (
              <div className="text-sm text-muted-foreground py-10 text-center">
                Loading skills...
              </div>
            ) : (
              <SkillsTab
                pluginSkills={pluginSkills}
                provider={providerScope}
                search={search}
                scopeFilter={scopeFilter}
                onRefresh={invalidateTools}
                showNewSkillForm={showNewSkill}
                onCloseNewSkill={() => setShowNewSkill(false)}
              />
            )}
          </div>
        </div>
      </PageScaffold>
    </PageContainer>
  );
}

export default function SkillsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-6">
          <div className="h-10 bg-muted rounded animate-pulse" />
          <div className="h-64 bg-muted rounded animate-pulse" />
        </div>
      }
    >
      <SkillsPageContent />
    </Suspense>
  );
}
