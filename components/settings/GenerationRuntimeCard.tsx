"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SettingRow } from "./SettingRow";
import {
  CLAUDE_CLI_MODEL_OPTIONS,
  CODEX_MODEL_OPTIONS,
  GEMINI_MODEL_OPTIONS,
  OPENAI_API_MODEL_OPTIONS,
  uniqueModelOptions,
  type ProviderModelOption,
} from "@/lib/models/provider-models";
import type {
  AppSettings,
  GenerationRuntimeMode,
  ThinkingLevel,
} from "@/lib/app-settings";
import type { ClaudeSettings } from "@/lib/claude-settings";

interface GenerationRuntimeCardProps {
  appSettings: AppSettings;
  claudeSettings: ClaudeSettings;
  onUpdateApp: (partial: Partial<AppSettings>) => Promise<void>;
  onUpdateClaude: (partial: Partial<ClaudeSettings>) => Promise<void>;
}

interface ProviderRuntimeRow {
  provider?: string;
  providerSlug?: string | null;
  displayName?: string;
  modelId?: string | null;
  isActive?: boolean;
}

const DEFAULT_MODEL_VALUE = "__provider_default__";
const API_MODEL_OPTIONS: ProviderModelOption[] = uniqueModelOptions([
  ...OPENAI_API_MODEL_OPTIONS,
  ...GEMINI_MODEL_OPTIONS,
  ...CLAUDE_CLI_MODEL_OPTIONS,
]);

export function GenerationRuntimeCard({
  appSettings,
  claudeSettings,
  onUpdateApp,
  onUpdateClaude,
}: GenerationRuntimeCardProps) {
  const [activeProviders, setActiveProviders] = useState<ProviderRuntimeRow[]>(
    [],
  );
  const runtime: GenerationRuntimeMode =
    appSettings.generationRuntime === "codex-cli" ||
      appSettings.generationRuntime === "api"
      ? appSettings.generationRuntime
      : "claude-cli";
  const runtimeDefaults = appSettings.generationDefaults?.[runtime];
  const activeModel = runtimeDefaults?.model ?? appSettings.generationModel;
  const thinking =
    runtimeDefaults?.thinkingLevel ??
    appSettings.generationThinkingLevel ??
    "medium";
  const claudeCliEnabled = claudeSettings.claudeCliEnabled !== false;
  const codexCliEnabled = appSettings.codexCliEnabled !== false;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/instructions/providers");
        if (!res.ok) return;
        const rows = (await res.json()) as ProviderRuntimeRow[];
        if (cancelled) return;
        setActiveProviders(rows.filter((row) => row.isActive));
      } catch {
        // Best-effort only.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeApiModelOptions = useMemo(() => {
    return uniqueModelOptions(
      activeProviders
        .map((provider) => provider.modelId?.trim())
        .filter((model): model is string => Boolean(model))
        .map((model) => ({ id: model, label: `${model} (active)` })),
    );
  }, [activeProviders]);

  const baseModelOptions = useMemo(() => {
    if (runtime === "claude-cli") return [...CLAUDE_CLI_MODEL_OPTIONS];
    if (runtime === "codex-cli") return [...CODEX_MODEL_OPTIONS];
    return uniqueModelOptions([...activeApiModelOptions, ...API_MODEL_OPTIONS]);
  }, [runtime, activeApiModelOptions]);

  const modelOptions = useMemo(() => {
    const configured = activeModel?.trim();
    if (
      configured &&
      !baseModelOptions.some((option) => option.id === configured)
    ) {
      return [
        { id: configured, label: `${configured} (custom)` },
        ...baseModelOptions,
      ];
    }
    return baseModelOptions;
  }, [activeModel, baseModelOptions]);

  const activeProviderNames = useMemo(
    () =>
      activeProviders.map(
        (provider) =>
          provider.displayName ||
          provider.providerSlug ||
          provider.provider ||
          "Provider",
      ),
    [activeProviders],
  );

  const updateRuntimeDefaults = async (
    partial: Partial<{ model?: string; thinkingLevel?: ThinkingLevel }>,
  ) => {
    const current = appSettings.generationDefaults ?? {};
    const nextForRuntime = {
      ...(current[runtime] ?? {}),
      ...partial,
    };

    if (!nextForRuntime.model) delete nextForRuntime.model;
    if (!nextForRuntime.thinkingLevel) delete nextForRuntime.thinkingLevel;

    await onUpdateApp({
      generationDefaults: {
        ...current,
        [runtime]: nextForRuntime,
      },
    });
  };

  const warning =
    runtime === "claude-cli" && !claudeCliEnabled
      ? "Claude CLI runtime is selected but currently disabled."
      : runtime === "codex-cli" && !codexCliEnabled
        ? "Codex CLI runtime is selected but currently disabled."
        : runtime === "api" && activeProviderNames.length === 0
          ? "API runtime is selected but no active API provider key is configured."
          : null;

  return (
    <Card className="card-hover-glow border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          Generation Runtime Defaults
        </CardTitle>
        <CardDescription>
          Used by AI-assisted generation flows (agents, workflows, skills,
          hooks). CLI runtimes run inside an isolated terminal session.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SettingRow
          label="Default Runtime"
          description="Choose Claude CLI, Codex CLI, or API key runtime for AI-assisted generation."
        >
          <Select
            value={runtime}
            onValueChange={(value) =>
              onUpdateApp({ generationRuntime: value as GenerationRuntimeMode })
            }
          >
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude-cli" className="text-xs">
                Claude CLI
              </SelectItem>
              <SelectItem value="codex-cli" className="text-xs">
                Codex CLI
              </SelectItem>
              <SelectItem value="api" className="text-xs">
                API Key
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          label="Model"
          description="Default model for the selected runtime. Runtime/provider defaults apply when not set."
        >
          <Select
            value={activeModel ?? DEFAULT_MODEL_VALUE}
            onValueChange={(value) => {
              void updateRuntimeDefaults({
                model: value === DEFAULT_MODEL_VALUE ? undefined : value,
              });
            }}
          >
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_MODEL_VALUE} className="text-xs">
                Provider default
              </SelectItem>
              {modelOptions.map((model) => (
                <SelectItem key={model.id} value={model.id} className="text-xs">
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          label="Thinking Level"
          description="Default reasoning level for the selected runtime."
        >
          <Select
            value={thinking}
            onValueChange={(value) => {
              void updateRuntimeDefaults({
                thinkingLevel: value as ThinkingLevel,
              });
            }}
          >
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low" className="text-xs">
                Low
              </SelectItem>
              <SelectItem value="medium" className="text-xs">
                Medium
              </SelectItem>
              <SelectItem value="high" className="text-xs">
                High
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          label="Claude CLI"
          description="Enable or disable Claude CLI as an available generation runtime."
          controlAlign="end"
        >
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="border-border/60 bg-muted/60 text-muted-foreground"
            >
              {claudeCliEnabled ? "Enabled" : "Disabled"}
            </Badge>
            <Switch
              checked={claudeCliEnabled}
              onCheckedChange={(checked) =>
                onUpdateClaude({ claudeCliEnabled: checked })
              }
              aria-label="Enable Claude CLI runtime"
            />
          </div>
        </SettingRow>

        <SettingRow
          label="Codex CLI"
          description="Enable or disable Codex CLI as an available generation runtime."
          controlAlign="end"
        >
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="border-border/60 bg-muted/60 text-muted-foreground"
            >
              {codexCliEnabled ? "Enabled" : "Disabled"}
            </Badge>
            <Switch
              checked={codexCliEnabled}
              onCheckedChange={(checked) =>
                onUpdateApp({ codexCliEnabled: checked })
              }
              aria-label="Enable Codex CLI runtime"
            />
          </div>
        </SettingRow>

        {runtime === "api" && (
          <SettingRow
            label="API Providers"
            description="Active provider keys available when API runtime is selected."
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {activeProviderNames.length > 0 ? (
                activeProviderNames.slice(0, 4).map((name) => (
                  <Badge
                    key={name}
                    variant="outline"
                    className="h-6 text-[11px] font-medium"
                  >
                    {name}
                  </Badge>
                ))
              ) : (
                <Badge variant="outline" className="h-6 text-[11px]">
                  No active API keys
                </Badge>
              )}
            </div>
          </SettingRow>
        )}

        {warning && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
            {warning}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
