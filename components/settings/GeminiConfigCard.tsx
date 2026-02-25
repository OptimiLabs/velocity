"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingRow } from "./SettingRow";
import {
  useGeminiSettings,
  useUpdateGeminiSettings,
} from "@/hooks/useGeminiSettings";
import { GEMINI_MODEL_OPTIONS } from "@/lib/models/provider-models";
import type { GeminiSettings } from "@/lib/gemini/settings";

const AUTH_TYPES = [
  { id: "__default__", label: "Default" },
  { id: "oauth", label: "OAuth" },
  { id: "api-key", label: "API Key" },
  { id: "service-account", label: "Service Account" },
];

interface GeminiConfigCardProps {
  settings?: GeminiSettings;
  isLoading?: boolean;
  isUpdating?: boolean;
  onUpdate?: (partial: Partial<GeminiSettings>) => Promise<void>;
}

type GeminiConfigDraft = {
  model: string;
  selectedAuthType: string;
  sandbox: boolean;
  yolo: boolean;
  telemetry: boolean;
  contextFileName: string;
  mcpServerCommand: string;
  mcpServerArgs: string;
  respectGitIgnore: boolean;
  disableLoadingPhrases: boolean;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function resolveModel(settings: GeminiSettings): string {
  const fromModelObject =
    settings.model &&
    typeof settings.model === "object" &&
    !Array.isArray(settings.model) &&
    typeof settings.model.name === "string"
      ? settings.model.name.trim()
      : "";
  if (fromModelObject) return fromModelObject;

  const fromModelString =
    typeof settings.model === "string" ? settings.model.trim() : "";
  if (fromModelString) return fromModelString;

  const selectedModel =
    typeof settings.selectedModel === "string"
      ? settings.selectedModel.trim()
      : "";
  if (selectedModel) return selectedModel;

  return "gemini-2.5-pro";
}

function stringifyMcpServerArgs(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((item) => String(item)).join("\n");
}

function parseMcpServerArgs(value: string): string[] | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const byLine = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (byLine.length > 1) return byLine;

  const byToken = trimmed.split(/\s+/).filter(Boolean);
  return byToken.length > 0 ? byToken : undefined;
}

function buildDraft(settings: GeminiSettings): GeminiConfigDraft {
  const fileFiltering = isObjectRecord(settings.fileFiltering)
    ? settings.fileFiltering
    : null;
  const accessibility = isObjectRecord(settings.accessibility)
    ? settings.accessibility
    : null;
  const context = isObjectRecord(settings.context) ? settings.context : null;

  const contextFileNameTop = readString(settings.contextFileName).trim();
  const contextFileNameNested = readString(context?.fileName).trim();

  const telemetry =
    typeof settings.telemetry === "boolean"
      ? settings.telemetry
      : readBoolean(settings.usageStatisticsEnabled, false);

  return {
    model: resolveModel(settings),
    selectedAuthType: readString(settings.selectedAuthType),
    sandbox: readBoolean(settings.sandbox, false),
    yolo: readBoolean(settings.yolo, false),
    telemetry,
    contextFileName: contextFileNameTop || contextFileNameNested,
    mcpServerCommand: readString(settings.mcpServerCommand),
    mcpServerArgs: stringifyMcpServerArgs(settings.mcpServerArgs),
    respectGitIgnore: readBoolean(fileFiltering?.respectGitIgnore, true),
    disableLoadingPhrases: readBoolean(
      accessibility?.disableLoadingPhrases,
      false,
    ),
  };
}

function draftsEqual(a: GeminiConfigDraft | null, b: GeminiConfigDraft | null) {
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffDraft(
  baseline: GeminiConfigDraft,
  next: GeminiConfigDraft,
  currentSettings: GeminiSettings,
): Partial<GeminiSettings> {
  const patch: Partial<GeminiSettings> = {};

  if (baseline.model !== next.model) {
    const trimmedModel = next.model.trim();
    const modelName = trimmedModel || undefined;
    const currentModel =
      currentSettings.model &&
      typeof currentSettings.model === "object" &&
      !Array.isArray(currentSettings.model)
        ? currentSettings.model
        : null;
    patch.selectedModel = modelName;
    patch.model = modelName
      ? {
          ...(currentModel || {}),
          name: modelName,
        }
      : undefined;
  }

  if (baseline.selectedAuthType !== next.selectedAuthType) {
    const trimmed = next.selectedAuthType.trim();
    patch.selectedAuthType = trimmed || undefined;
  }

  if (baseline.sandbox !== next.sandbox) {
    patch.sandbox = next.sandbox;
  }

  if (baseline.yolo !== next.yolo) {
    patch.yolo = next.yolo;
  }

  if (baseline.telemetry !== next.telemetry) {
    patch.telemetry = next.telemetry;
    patch.usageStatisticsEnabled = next.telemetry;
  }

  if (baseline.contextFileName !== next.contextFileName) {
    const trimmed = next.contextFileName.trim();
    const fileName = trimmed || undefined;
    patch.contextFileName = fileName;
    patch.context = {
      ...(isObjectRecord(currentSettings.context) ? currentSettings.context : {}),
      fileName,
    };
  }

  if (baseline.mcpServerCommand !== next.mcpServerCommand) {
    const trimmed = next.mcpServerCommand.trim();
    patch.mcpServerCommand = trimmed || undefined;
  }

  if (baseline.mcpServerArgs !== next.mcpServerArgs) {
    patch.mcpServerArgs = parseMcpServerArgs(next.mcpServerArgs);
  }

  if (baseline.respectGitIgnore !== next.respectGitIgnore) {
    patch.fileFiltering = {
      ...(isObjectRecord(currentSettings.fileFiltering)
        ? currentSettings.fileFiltering
        : {}),
      respectGitIgnore: next.respectGitIgnore,
    };
  }

  if (baseline.disableLoadingPhrases !== next.disableLoadingPhrases) {
    patch.accessibility = {
      ...(isObjectRecord(currentSettings.accessibility)
        ? currentSettings.accessibility
        : {}),
      disableLoadingPhrases: next.disableLoadingPhrases,
    };
  }

  return patch;
}

export function GeminiConfigCard({
  settings: externalSettings,
  isLoading: externalLoading,
  isUpdating: externalUpdating,
  onUpdate,
}: GeminiConfigCardProps) {
  const internalSettingsQuery = useGeminiSettings();
  const internalUpdate = useUpdateGeminiSettings();

  const settings = externalSettings ?? internalSettingsQuery.data;
  const isLoading = externalLoading ?? internalSettingsQuery.isLoading;
  const isMutating = externalUpdating ?? internalUpdate.isPending;
  const applyPatch =
    onUpdate ??
    (async (partial: Partial<GeminiSettings>) => {
      await internalUpdate.mutateAsync(partial);
    });

  const [draft, setDraft] = useState<GeminiConfigDraft | null>(null);
  const [baselineDraft, setBaselineDraft] = useState<GeminiConfigDraft | null>(
    null,
  );
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const draftRef = useRef<GeminiConfigDraft | null>(null);
  const baselineDraftRef = useRef<GeminiConfigDraft | null>(null);
  const lastFailedSignatureRef = useRef<string | null>(null);

  const hasChanges =
    draft !== null &&
    baselineDraft !== null &&
    draftsEqual(draft, baselineDraft) === false;

  const draftSignature = useMemo(() => {
    try {
      return draft ? JSON.stringify(draft) : "null";
    } catch {
      return "__unserializable__";
    }
  }, [draft]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    baselineDraftRef.current = baselineDraft;
  }, [baselineDraft]);

  useEffect(() => {
    if (!settings) return;
    const next = buildDraft(settings);
    const isDirty =
      draftsEqual(draftRef.current, baselineDraftRef.current) === false;
    setBaselineDraft(next);
    if (!isDirty || !draftRef.current) {
      setDraft(next);
    }
  }, [settings]);

  useEffect(() => {
    if (!draft || !baselineDraft || !hasChanges || isMutating) return;
    if (lastFailedSignatureRef.current === draftSignature) return;

    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      setSaveError(null);
      try {
        const patch = diffDraft(baselineDraft, draft, settings || {});
        if (Object.keys(patch).length === 0) {
          setSaveState("saved");
          return;
        }
        await applyPatch(patch);
        setBaselineDraft(draft);
        baselineDraftRef.current = draft;
        setSaveState("saved");
        lastFailedSignatureRef.current = null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setSaveState("error");
        setSaveError(message);
        lastFailedSignatureRef.current = draftSignature;
        toast.error("Failed to auto-save Gemini settings");
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    applyPatch,
    baselineDraft,
    draft,
    draftSignature,
    hasChanges,
    isMutating,
    settings,
  ]);

  const patchDraft = (partial: Partial<GeminiConfigDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...partial } : prev));
    setSaveState((prev) => (prev === "saved" ? "idle" : prev));
    setSaveError(null);
    lastFailedSignatureRef.current = null;
  };

  const handleReset = () => {
    if (!baselineDraft) return;
    setDraft(baselineDraft);
    setSaveState("idle");
    setSaveError(null);
    lastFailedSignatureRef.current = null;
  };

  if (isLoading || !settings || !draft) {
    return (
      <Card className="card-hover-glow border-border/70 bg-card/95">
        <CardHeader>
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40" />
        </CardContent>
      </Card>
    );
  }

  const modelOptions = GEMINI_MODEL_OPTIONS.some((m) => m.id === draft.model)
    ? GEMINI_MODEL_OPTIONS
    : [{ id: draft.model, label: `${draft.model} (custom)` }, ...GEMINI_MODEL_OPTIONS];
  const authOptions =
    draft.selectedAuthType &&
    !AUTH_TYPES.some((option) => option.id === draft.selectedAuthType)
      ? [
          {
            id: draft.selectedAuthType,
            label: `${draft.selectedAuthType} (custom)`,
          },
          ...AUTH_TYPES,
        ]
      : AUTH_TYPES;

  return (
    <Card className="card-hover-glow border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          Gemini Configuration
        </CardTitle>
        <CardDescription>
          Saved to ~/.gemini/settings.json and applied to Gemini CLI sessions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            Changes auto-save after you stop editing.
          </div>
          {saveState === "saving" || isMutating ? (
            <Badge variant="secondary">Saving...</Badge>
          ) : saveState === "error" ? (
            <Badge variant="warning">Auto-save failed</Badge>
          ) : hasChanges ? (
            <Badge variant="warning">Pending changes</Badge>
          ) : (
            <Badge variant="secondary">Saved</Badge>
          )}
        </div>
        {saveState === "error" && saveError ? (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            {saveError}
          </div>
        ) : null}

        <section className="space-y-2 rounded-md border border-border/70 bg-background/40 p-3">
          <div className="text-xs font-medium">Core</div>
          <SettingRow
            label="Model"
            description="Default Gemini model for new sessions."
          >
            <Select
              value={draft.model}
              onValueChange={(value) => patchDraft({ model: value })}
            >
              <SelectTrigger className="h-8 w-56 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>

          <SettingRow
            label="Auth Type"
            description="How Gemini CLI should authenticate by default."
          >
            <Select
              value={draft.selectedAuthType || "__default__"}
              onValueChange={(value) =>
                patchDraft({
                  selectedAuthType: value === "__default__" ? "" : value,
                })
              }
            >
              <SelectTrigger className="h-8 w-56 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {authOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        </section>

        <section className="space-y-2 rounded-md border border-border/70 bg-background/40 p-3">
          <div className="text-xs font-medium">Runtime Flags</div>
          <SettingRow
            label="Sandbox"
            description="Enable Gemini sandbox safeguards."
          >
            <Switch
              checked={draft.sandbox}
              onCheckedChange={(checked) => patchDraft({ sandbox: checked })}
            />
          </SettingRow>

          <SettingRow
            label="YOLO Mode"
            description="Allow less constrained execution behavior."
          >
            <Switch
              checked={draft.yolo}
              onCheckedChange={(checked) => patchDraft({ yolo: checked })}
            />
          </SettingRow>

          <SettingRow
            label="Telemetry"
            description="Allow Gemini usage telemetry collection."
          >
            <Switch
              checked={draft.telemetry}
              onCheckedChange={(checked) => patchDraft({ telemetry: checked })}
            />
          </SettingRow>
        </section>

        <section className="space-y-2 rounded-md border border-border/70 bg-background/40 p-3">
          <div className="text-xs font-medium">Context & MCP</div>
          <SettingRow
            label="Context File Name"
            description="Default context file loaded for Gemini sessions."
          >
            <Input
              value={draft.contextFileName}
              onChange={(event) =>
                patchDraft({ contextFileName: event.target.value })
              }
              placeholder="GEMINI.md"
              className="h-8 w-56 text-xs font-mono"
            />
          </SettingRow>

          <SettingRow
            label="MCP Server Command"
            description="Command used to launch your default MCP server."
          >
            <Input
              value={draft.mcpServerCommand}
              onChange={(event) =>
                patchDraft({ mcpServerCommand: event.target.value })
              }
              placeholder="npx"
              className="h-8 w-56 text-xs font-mono"
            />
          </SettingRow>

          <SettingRow
            label="MCP Server Args"
            description="Arguments for the MCP server command (newline or space separated)."
            controlAlign="start"
          >
            <Textarea
              value={draft.mcpServerArgs}
              onChange={(event) =>
                patchDraft({ mcpServerArgs: event.target.value })
              }
              placeholder={"--yes\n@modelcontextprotocol/server-filesystem"}
              className="min-h-20 w-full max-w-xl text-xs font-mono"
            />
          </SettingRow>

          <SettingRow
            label="Respect .gitignore"
            description="Exclude ignored files when Gemini scans your workspace."
          >
            <Switch
              checked={draft.respectGitIgnore}
              onCheckedChange={(checked) =>
                patchDraft({ respectGitIgnore: checked })
              }
            />
          </SettingRow>

          <SettingRow
            label="Disable Loading Phrases"
            description="Reduce accessibility noise by suppressing loading phrase announcements."
          >
            <Switch
              checked={draft.disableLoadingPhrases}
              onCheckedChange={(checked) =>
                patchDraft({ disableLoadingPhrases: checked })
              }
            />
          </SettingRow>
        </section>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasChanges || isMutating}
            onClick={handleReset}
          >
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
