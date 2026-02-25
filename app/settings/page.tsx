"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useAppSettings, useUpdateAppSettings } from "@/hooks/useAppSettings";
import {
  useGeminiSettings,
  useUpdateGeminiSettings,
} from "@/hooks/useGeminiSettings";
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
import { GeminiConfigCard } from "@/components/settings/GeminiConfigCard";
import { SessionMaintenanceCard } from "@/components/settings/SessionMaintenanceCard";
import { GenerationRuntimeCard } from "@/components/settings/GenerationRuntimeCard";
import { PermissionsTab } from "@/components/settings/PermissionsTab";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import type { ClaudeSettings } from "@/lib/claude-settings";
import type { AppSettings } from "@/lib/app-settings";
import type { GeminiSettings } from "@/lib/gemini/settings";
import { useCompressAllSessionsBulk } from "@/hooks/useSessions";
import { useConfirm } from "@/hooks/useConfirm";

const RESTART_KEYS = new Set(["hooks", "mcpServers", "disabledMcpServers"]);
type SettingsTab = "core" | "claude" | "codex" | "gemini";

function resolveSettingsTab(tab: string | null): SettingsTab {
  if (tab === "claude" || tab === "permissions") {
    return "claude";
  }
  if (tab === "codex") return "codex";
  if (tab === "gemini") return "gemini";
  return "core";
}

function resolveSettingsSection(section: string | null): string | null {
  if (section === "permissions") return "settings-permissions";
  return null;
}

function stableDraftSignature(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return "__unserializable__";
  }
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab") ?? null;
  const sectionParam = searchParams?.get("section") ?? null;
  const { confirm } = useConfirm();
  const { data: settings, isLoading } = useSettings();
  const { data: appSettings, isLoading: appSettingsLoading } = useAppSettings();
  const { data: geminiSettings, isLoading: geminiSettingsLoading } =
    useGeminiSettings();
  const updateSettings = useUpdateSettings();
  const updateAppSettings = useUpdateAppSettings();
  const updateGeminiSettings = useUpdateGeminiSettings();
  const compressAllSessions = useCompressAllSessionsBulk();
  const [restarting, setRestarting] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
    resolveSettingsTab(tabParam),
  );

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
  const lastFailedClaudeSignatureRef = useRef<string | null>(null);
  const lastFailedCoreSignatureRef = useRef<string | null>(null);

  const claudeDraftSignature = useMemo(
    () => stableDraftSignature(claudeDraft.draft),
    [claudeDraft.draft],
  );
  const coreDraftSignature = useMemo(
    () => stableDraftSignature(coreDraft.draft),
    [coreDraft.draft],
  );

  useEffect(() => {
    if (!claudeDraft.isDirty || claudeDraft.isSaving) return;
    if (lastFailedClaudeSignatureRef.current === claudeDraftSignature) return;

    const timer = window.setTimeout(() => {
      void claudeDraft
        .save()
        .then(() => {
          lastFailedClaudeSignatureRef.current = null;
        })
        .catch(() => {
          lastFailedClaudeSignatureRef.current = claudeDraftSignature;
          toast.error("Failed to auto-save Claude settings");
        });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    claudeDraft.isDirty,
    claudeDraft.isSaving,
    claudeDraft.save,
    claudeDraftSignature,
  ]);

  useEffect(() => {
    if (!coreDraft.isDirty || coreDraft.isSaving) return;
    if (lastFailedCoreSignatureRef.current === coreDraftSignature) return;

    const timer = window.setTimeout(() => {
      void coreDraft
        .save()
        .then(() => {
          lastFailedCoreSignatureRef.current = null;
        })
        .catch(() => {
          lastFailedCoreSignatureRef.current = coreDraftSignature;
          toast.error("Failed to auto-save core settings");
        });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [coreDraft.isDirty, coreDraft.isSaving, coreDraft.save, coreDraftSignature]);

  useEffect(() => {
    const nextTab = resolveSettingsTab(tabParam);
    setActiveTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [tabParam]);

  useEffect(() => {
    if (activeTab !== "claude") return;
    const targetId = resolveSettingsSection(sectionParam);
    if (!targetId) return;
    const raf = window.requestAnimationFrame(() => {
      const el = document.getElementById(targetId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeTab, sectionParam]);

  if (
    isLoading ||
    appSettingsLoading ||
    geminiSettingsLoading ||
    !settings ||
    !draftSettings ||
    !coreSettings
  ) {
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
      `${claudeDirtyKeyCount} pending Claude change${
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
  if (claudeDraft.saveState === "error" && claudeDraft.saveError) {
    claudeStatusParts.push("Auto-save failed");
  }
  const coreStatusParts: string[] = [];
  if (coreDraft.dirtyKeys.length > 0) {
    coreStatusParts.push(
      `${coreDraft.dirtyKeys.length} pending core change${
        coreDraft.dirtyKeys.length === 1 ? "" : "s"
      }`,
    );
  }
  if (coreDraft.isSaving) coreStatusParts.push("Saving core settings...");
  if (coreDraft.saveState === "error" && coreDraft.saveError) {
    coreStatusParts.push("Auto-save failed");
  }
  const geminiStatusParts: string[] = [];
  if (updateGeminiSettings.isPending) {
    geminiStatusParts.push("Saving Gemini settings...");
  }

  const handleClaudeDraftUpdate = async (partial: Partial<ClaudeSettings>) => {
    claudeDraft.patchDraft(partial);
  };

  const handleCoreUpdate = async (partial: Partial<AppSettings>) => {
    coreDraft.patchDraft(partial);
  };

  const handleGeminiUpdate = async (partial: Partial<GeminiSettings>) => {
    await updateGeminiSettings.mutateAsync(partial);
  };

  const handleCompressAllSessions = async () => {
    toast.warning(
      "You're about to compress every session. This hides them from default session lists, but keeps transcripts, analytics, and usage history.",
      { duration: 7000 },
    );

    const ok = await confirm({
      title: "Compress all sessions?",
      description:
        "Compression marks all sessions as hidden in default views. It does not delete transcripts or remove analytics, usage metrics, and cost history. You can restore sessions later from the Sessions page.",
      confirmLabel: "Compress All Sessions",
      cancelLabel: "Cancel",
      variant: "default",
    });
    if (!ok) return;
    try {
      await compressAllSessions.mutateAsync();
    } catch {
      // toast handled by hook
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
            <TabsTrigger value="gemini" className="h-8 flex-none px-3 text-xs">
              Gemini
            </TabsTrigger>
          </TabsList>

          <TabsContent value="core" className="space-y-5">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Core Settings</h2>
            </div>

            <section className="space-y-3">
              <GenerationRuntimeCard
                appSettings={coreSettings}
                claudeSettings={draftSettings}
                onUpdateApp={handleCoreUpdate}
                onUpdateClaude={handleClaudeDraftUpdate}
              />
            </section>

            <section className="space-y-3">
              {coreStatusParts.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  {coreStatusParts.join(" · ")}
                </div>
              )}
              <CorePreferencesCard
                settings={coreSettings}
                onUpdate={handleCoreUpdate}
              />
            </section>

            <section className="space-y-3">
              <SessionMaintenanceCard
                isCompressingAll={compressAllSessions.isPending}
                onCompressAllSessions={handleCompressAllSessions}
              />
            </section>
          </TabsContent>

          <TabsContent value="claude" className="space-y-5">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-semibold tracking-tight sm:whitespace-nowrap">
                Claude Settings
              </h2>
              <span className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground sm:ml-auto sm:shrink-0 sm:whitespace-nowrap">
                ~/.claude/settings.json
              </span>
            </div>

            {claudeStatusParts.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {claudeStatusParts.join(" · ")}
              </div>
            )}

            <div className="space-y-5">
              <ModelProvidersCard
                settings={draftSettings}
                onUpdate={handleClaudeDraftUpdate}
                variant="claude"
              />
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
              <section id="settings-permissions" className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Permissions
                </h3>
                <PermissionsTab
                  settings={draftSettings}
                  onUpdate={handleClaudeDraftUpdate}
                />
              </section>
            </div>
            {claudeNeedsRestart && !claudeDraft.isSaving && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                Some changes will restart active sessions after auto-save.
              </div>
            )}
          </TabsContent>

          <TabsContent value="codex" className="space-y-5">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Codex Settings</h2>
            </div>
            <ModelProvidersCard
              settings={draftSettings}
              variant="codex"
              codexCliEnabled={coreSettings.codexCliEnabled}
              onUpdateApp={handleCoreUpdate}
            />
            <CodexConfigCard />
          </TabsContent>

          <TabsContent value="gemini" className="space-y-5">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-semibold tracking-tight sm:whitespace-nowrap">
                Gemini Settings
              </h2>
              <span className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground sm:ml-auto sm:shrink-0 sm:whitespace-nowrap">
                ~/.gemini/settings.json
              </span>
            </div>
            {geminiStatusParts.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {geminiStatusParts.join(" · ")}
              </div>
            )}
            <ModelProvidersCard
              settings={draftSettings}
              variant="gemini"
              geminiCliEnabled={coreSettings.geminiCliEnabled}
              onUpdateApp={handleCoreUpdate}
            />
            <GeminiConfigCard
              settings={geminiSettings}
              isLoading={geminiSettingsLoading}
              isUpdating={updateGeminiSettings.isPending}
              onUpdate={handleGeminiUpdate}
            />
          </TabsContent>
        </Tabs>
      </PageScaffold>
    </PageContainer>
  );
}
