"use client";

import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { Skeleton } from "@/components/ui/skeleton";
import { HooksTab } from "@/components/settings/HooksTab";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import type { ClaudeSettings } from "@/lib/claude-settings";
import { useProviderScopeStore } from "@/stores/providerScopeStore";
import { getSessionProvider } from "@/lib/providers/session-registry";

export default function HooksPage() {
  const providerScope = useProviderScopeStore((s) => s.providerScope);
  const providerLabel =
    getSessionProvider(providerScope)?.label ?? providerScope;
  const { data: settings, isLoading } = useSettings(providerScope === "claude");
  const updateMutation = useUpdateSettings();

  const handleUpdate = async (partial: Partial<ClaudeSettings>) => {
    await updateMutation.mutateAsync(partial);
  };

  if (providerScope !== "claude") {
    return (
      <PageContainer>
        <PageScaffold
          title="Hooks"
          subtitle="Hook configuration is currently supported for Claude only."
        >
          <div className="rounded-2xl border border-border/70 bg-card/95 shadow-sm p-5 text-sm text-muted-foreground">
            Current scope:{" "}
            <span className="font-medium text-foreground">{providerLabel}</span>. Switch to{" "}
            <span className="font-medium text-foreground">Claude</span> to manage hooks.
          </div>
        </PageScaffold>
      </PageContainer>
    );
  }

  if (isLoading || !settings) {
    return (
      <PageContainer>
        <PageScaffold
          title="Hooks"
          subtitle="Configure hook events, rules, and runtime behavior for Claude sessions."
        >
          <div className="space-y-4 rounded-2xl border border-border/70 bg-card/95 p-4 sm:p-5">
            <Skeleton className="h-8 w-[200px]" />
            <Skeleton className="h-32" />
            <Skeleton className="h-64" />
          </div>
        </PageScaffold>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageScaffold
        title="Hooks"
        subtitle="Manage Claude hook rules and inspect event-specific automations in one place."
      >
        <div className="rounded-2xl border border-border/70 bg-card/95 shadow-sm p-4 sm:p-5">
          {updateMutation.isPending && (
            <div className="mb-3 text-right text-xs text-muted-foreground animate-pulse">
              Saving…
            </div>
          )}
          <HooksTab settings={settings} onUpdate={handleUpdate} />
        </div>
      </PageScaffold>
    </PageContainer>
  );
}
