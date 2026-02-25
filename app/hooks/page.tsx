"use client";

import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { Skeleton } from "@/components/ui/skeleton";
import { HooksTab } from "@/components/settings/HooksTab";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import type { ClaudeSettings } from "@/lib/claude-settings";
import { useProviderScopeStore } from "@/stores/providerScopeStore";
import { getSessionProvider } from "@/lib/providers/session-registry";
import { isProviderSupportedForConfigRoute } from "@/lib/providers/config-scope";
import {
  useGeminiSettings,
  useUpdateGeminiSettings,
} from "@/hooks/useGeminiSettings";
import type { GeminiSettings } from "@/lib/gemini/settings";

export default function HooksPage() {
  const providerScope = useProviderScopeStore((s) => s.providerScope);
  const hooksSupported = isProviderSupportedForConfigRoute("/hooks", providerScope);
  const isClaudeScope = providerScope === "claude";
  const isGeminiScope = providerScope === "gemini";
  const providerLabel =
    getSessionProvider(providerScope)?.label ?? providerScope;
  const claudeSettingsQuery = useSettings(hooksSupported && isClaudeScope);
  const geminiSettingsQuery = useGeminiSettings(hooksSupported && isGeminiScope);
  const updateClaudeMutation = useUpdateSettings();
  const updateGeminiMutation = useUpdateGeminiSettings();

  const handleUpdate = async (partial: Partial<ClaudeSettings>) => {
    if (isGeminiScope) {
      await updateGeminiMutation.mutateAsync(
        partial as unknown as Partial<GeminiSettings>,
      );
      return;
    }
    await updateClaudeMutation.mutateAsync(partial);
  };

  const settings = (
    isGeminiScope ? geminiSettingsQuery.data : claudeSettingsQuery.data
  ) as ClaudeSettings | undefined;
  const isLoading = isGeminiScope
    ? geminiSettingsQuery.isLoading
    : claudeSettingsQuery.isLoading;
  const isSaving = isGeminiScope
    ? updateGeminiMutation.isPending
    : updateClaudeMutation.isPending;

  if (!hooksSupported) {
    return (
      <PageContainer>
        <PageScaffold
          title="Hooks"
          subtitle="Hook configuration is not available for this provider."
        >
          <div className="rounded-2xl border border-border/70 bg-card/95 shadow-sm p-5 text-sm text-muted-foreground">
            Current scope:{" "}
            <span className="font-medium text-foreground">{providerLabel}</span>.
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
          subtitle={`Configure hook events, rules, and runtime behavior for ${providerLabel} sessions.`}
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
        subtitle={`Manage ${providerLabel} hook rules and inspect event-specific automations in one place.`}
      >
        <div className="rounded-2xl border border-border/70 bg-card/95 shadow-sm p-4 sm:p-5">
          {isSaving && (
            <div className="mb-3 text-right text-xs text-muted-foreground animate-pulse">
              Saving…
            </div>
          )}
          <HooksTab
            settings={settings}
            onUpdate={handleUpdate}
            provider={isGeminiScope ? "gemini" : "claude"}
          />
        </div>
      </PageScaffold>
    </PageContainer>
  );
}
