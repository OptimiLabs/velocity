"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useAppSettings, useUpdateAppSettings } from "@/hooks/useAppSettings";
import { useDraftSettingsCard } from "@/hooks/useDraftSettingsCard";
import { ModelProvidersCard } from "@/components/settings/ModelProvidersCard";
import {
  ClaudeDefaultsCard,
  AppPreferencesCard,
} from "@/components/settings/BehaviorCard";
import { CorePreferencesCard } from "@/components/settings/CorePreferencesCard";
import { ExperimentalCard } from "@/components/settings/ExperimentalCard";
import { EnvVarsCard } from "@/components/settings/EnvVarsCard";
import { CodexConfigCard } from "@/components/settings/CodexConfigCard";
import { SettingsFooter } from "@/components/settings/SettingsFooter";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import type { ClaudeSettings } from "@/lib/claude-settings";
import type { AppSettings } from "@/lib/app-settings";

const RESTART_KEYS = new Set(["hooks", "mcpServers", "disabledMcpServers"]);
type SettingsTab = "core" | "claude" | "codex";

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const { data: appSettings, isLoading: appSettingsLoading } = useAppSettings();
  const updateSettings = useUpdateSettings();
  const updateAppSettings = useUpdateAppSettings();
  const [restarting, setRestarting] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("core");

  const claudeDraft = useDraftSettingsCard<ClaudeSettings>({
    source: settings,
    onSave: async ({ patch }) => {
      await updateSettings.mutateAsync(patch);
      const needsRestart = Object.keys(patch).some((k) => RESTART_KEYS.has(k));
      if (needsRestart) {
        window.dispatchEvent(new CustomEvent("mcp:restart-sessions"));
        setRestarting(true);
        setTimeout(() => setRestarting(false), 3000);
      }
    },
  });

  const coreDraft = useDraftSettingsCard<AppSettings>({
    source: appSettings,
    onSave: async ({ patch }) => {
      await updateAppSettings.mutateAsync(patch);
    },
  });

  const draftSettings = claudeDraft.draft;
  const coreSettings = coreDraft.draft;

  if (isLoading || appSettingsLoading || !settings || !draftSettings || !coreSettings) {
    return (
      <PageContainer>
        <Skeleton className="h-10" />
        <Skeleton className="h-64" />
      </PageContainer>
    );
  }

  const claudeDirtyKeyCount = claudeDraft.dirtyKeys.length;
  const claudeNeedsRestart = claudeDraft.dirtyKeys.some((key) =>
    RESTART_KEYS.has(key),
  );
  const claudeStatusParts: string[] = [];
  if (claudeDirtyKeyCount > 0) {
    claudeStatusParts.push(
      `${claudeDirtyKeyCount} unsaved Claude change${
        claudeDirtyKeyCount === 1 ? "" : "s"
      }`,
    );
  }
  if (claudeDraft.hasIncomingRefresh) {
    claudeStatusParts.push("Server refresh pending");
  }
  if (claudeDraft.isSaving || restarting) {
    claudeStatusParts.push(
      claudeDraft.isSaving
        ? "Saving Claude settings..."
        : "Restarting sessions...",
    );
  }
  const coreStatusParts: string[] = [];
  if (coreDraft.dirtyKeys.length > 0) {
    coreStatusParts.push(
      `${coreDraft.dirtyKeys.length} unsaved core change${
        coreDraft.dirtyKeys.length === 1 ? "" : "s"
      }`,
    );
  }
  if (coreDraft.isSaving) coreStatusParts.push("Saving core settings...");

  const handleClaudeDraftUpdate = async (partial: Partial<ClaudeSettings>) => {
    claudeDraft.patchDraft(partial);
  };

  const handleClaudeSave = async () => {
    try {
      await claudeDraft.save();
      toast.success("Claude settings saved");
    } catch {
      toast.error("Failed to save settings");
    }
  };

  const handleCoreUpdate = async (partial: Partial<AppSettings>) => {
    coreDraft.patchDraft(partial);
  };

  const handleCoreSave = async () => {
    try {
      await coreDraft.save();
      toast.success("Core settings saved");
    } catch {
      toast.error("Failed to save core settings");
    }
  };

  return (
    <PageContainer>
      <PageScaffold
        title="Settings"
        subtitle="Core app preferences, provider defaults, and provider-specific configuration."
      >
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as SettingsTab)}
          className="space-y-4"
        >
          <TabsList
            variant="line"
            className="h-auto w-full justify-start rounded-none border-b border-border/60 bg-transparent p-0"
          >
            <TabsTrigger value="core" className="h-8 flex-none px-3 text-xs">
              Core
            </TabsTrigger>
            <TabsTrigger value="claude" className="h-8 flex-none px-3 text-xs">
              Claude
            </TabsTrigger>
            <TabsTrigger value="codex" className="h-8 flex-none px-3 text-xs">
              Codex
            </TabsTrigger>
          </TabsList>

          <TabsContent value="core" className="space-y-5">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Core Settings</h2>
            </div>

            <section className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold tracking-tight sm:whitespace-nowrap">
                  Model & Provider Defaults
                </h3>
                <span className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground sm:shrink-0 sm:whitespace-nowrap">
                  ~/.claude/settings.json
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Set default model/provider behavior and API keys used by Claude-backed features.
              </div>
              {claudeStatusParts.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  {claudeStatusParts.join(" · ")}
                </div>
              )}
              <ModelProvidersCard
                settings={draftSettings}
                onUpdate={handleClaudeDraftUpdate}
              />
              <SettingsFooter
                isDirty={claudeDraft.isDirty}
                isSaving={claudeDraft.isSaving}
                onReset={claudeDraft.reset}
                onSave={handleClaudeSave}
                warning={claudeNeedsRestart ? "Save will restart sessions" : undefined}
                hint={
                  claudeDraft.hasIncomingRefresh
                    ? "New server settings were fetched while editing. Save or reset to resync."
                    : "Batch changes are applied when you click Save Changes."
                }
              />
            </section>

            <section className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-semibold tracking-tight sm:whitespace-nowrap">
                  Dashboard Preferences
                </h3>
                <span className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground sm:shrink-0 sm:whitespace-nowrap">
                  ~/.claude/velocity-settings.json
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Dashboard-only behavior and local UI defaults.
              </div>
              {coreStatusParts.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  {coreStatusParts.join(" · ")}
                </div>
              )}
              <CorePreferencesCard
                settings={coreSettings}
                onUpdate={handleCoreUpdate}
              />
              <SettingsFooter
                isDirty={coreDraft.isDirty}
                isSaving={coreDraft.isSaving}
                onReset={coreDraft.reset}
                onSave={handleCoreSave}
                saveLabel="Save Core Settings"
                savedLabel="Core settings saved"
                hint="Saved to ~/.claude/velocity-settings.json."
              />
            </section>
          </TabsContent>

          <TabsContent value="claude" className="space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-semibold tracking-tight sm:whitespace-nowrap">
                Claude Settings
              </h2>
              <span className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground sm:shrink-0 sm:whitespace-nowrap">
                ~/.claude/settings.json
              </span>
            </div>

            <div className="text-xs text-muted-foreground">
              Claude changes save with{" "}
              <span className="font-medium text-foreground">Save Changes</span>.
            </div>
            {claudeStatusParts.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {claudeStatusParts.join(" · ")}
              </div>
            )}

            <div className="space-y-5">
              <ClaudeDefaultsCard
                settings={draftSettings}
                onUpdate={handleClaudeDraftUpdate}
              />
              <AppPreferencesCard
                settings={draftSettings}
                onUpdate={handleClaudeDraftUpdate}
              />
              <EnvVarsCard
                settings={draftSettings}
                onUpdate={handleClaudeDraftUpdate}
              />
              <ExperimentalCard
                settings={draftSettings}
                onUpdate={handleClaudeDraftUpdate}
              />
            </div>
            <SettingsFooter
              isDirty={claudeDraft.isDirty}
              isSaving={claudeDraft.isSaving}
              onReset={claudeDraft.reset}
              onSave={handleClaudeSave}
              warning={claudeNeedsRestart ? "Save will restart sessions" : undefined}
              hint={
                claudeDraft.hasIncomingRefresh
                  ? "New server settings were fetched while editing. Save or reset to resync."
                  : "Batch changes are applied when you click Save Changes."
              }
            />
          </TabsContent>

          <TabsContent value="codex" className="space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-semibold tracking-tight sm:whitespace-nowrap">
                Codex Configuration
              </h2>
              <span className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground sm:shrink-0 sm:whitespace-nowrap">
                ~/.codex/config.toml
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Codex changes are saved from the Codex card footer.
            </div>
            <CodexConfigCard />
          </TabsContent>
        </Tabs>
      </PageScaffold>
    </PageContainer>
  );
}
