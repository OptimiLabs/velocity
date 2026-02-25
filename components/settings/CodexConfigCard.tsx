"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SettingRow } from "./SettingRow";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCodexSettings,
  useUpdateCodexSettings,
} from "@/hooks/useCodexSettings";
import {
  fromCodexUiPatch,
  toCodexUiModel,
  type CodexConfigUiModel,
} from "@/lib/codex/settings-analysis";
import { CODEX_MODEL_OPTIONS } from "@/lib/models/provider-models";
import { toast } from "sonner";
import type { CodexSettings } from "@/lib/codex/settings";

const APPROVAL_POLICIES = [
  { id: "untrusted", label: "Untrusted" },
  { id: "on-request", label: "On Request" },
  { id: "never", label: "Never Ask" },
];

const SANDBOX_MODES = [
  { id: "read-only", label: "Read-only" },
  { id: "workspace-write", label: "Workspace Write" },
  { id: "danger-full-access", label: "Danger Full Access" },
];

const MODEL_PROVIDERS = [
  { id: "__auto__", label: "Default" },
  { id: "openai", label: "OpenAI Cloud" },
  { id: "oss", label: "Local OSS (Ollama/LM Studio)" },
];
const LOCAL_PROVIDERS = [
  { id: "__auto__", label: "Auto" },
  { id: "ollama", label: "Ollama" },
  { id: "lmstudio", label: "LM Studio" },
];

const REASONING_EFFORTS = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "XHigh" },
];

type CodexConfigDraft = {
  model: string;
  modelProvider: string;
  localProvider: "" | "ollama" | "lmstudio";
  approvalPolicy: "untrusted" | "on-request" | "never";
  sandboxEnabled: boolean;
  sandboxMode: "read-only" | "workspace-write" | "danger-full-access";
  webSearchEnabled: boolean;
  reasoningEffort: "low" | "medium" | "high" | "xhigh";
  historyEnabled: boolean;
  historyMaxEntries: string;
  personality: string;
  featureMultiAgent: boolean;
  featureRemoteModels: boolean;
  featurePreventIdleSleep: boolean;
};

function buildDraft(settings: CodexSettings): CodexConfigDraft {
  const ui = toCodexUiModel(settings);
  return {
    model: ui.model || "o3",
    modelProvider: ui.modelProvider || "",
    localProvider: ui.localProvider || "",
    approvalPolicy: ui.approvalPolicy || "on-request",
    sandboxEnabled: ui.sandboxEnabled ?? false,
    sandboxMode: ui.sandboxMode || "workspace-write",
    webSearchEnabled: ui.webSearchEnabled ?? false,
    reasoningEffort: ui.reasoningEffort || "medium",
    historyEnabled: ui.historyEnabled ?? true,
    historyMaxEntries:
      ui.historyMaxEntries != null ? String(ui.historyMaxEntries) : "",
    personality: ui.personality || "",
    featureMultiAgent: ui.featureMultiAgent ?? false,
    featureRemoteModels: ui.featureRemoteModels ?? false,
    featurePreventIdleSleep: ui.featurePreventIdleSleep ?? false,
  };
}

function draftsEqual(a: CodexConfigDraft | null, b: CodexConfigDraft | null): boolean {
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffDraft(
  baseline: CodexConfigDraft,
  next: CodexConfigDraft,
): Partial<CodexConfigUiModel> {
  const patch: Partial<CodexConfigUiModel> = {};
  if (baseline.model !== next.model) patch.model = next.model;
  if (baseline.modelProvider !== next.modelProvider) {
    patch.modelProvider = next.modelProvider;
  }
  if (baseline.localProvider !== next.localProvider) {
    patch.localProvider = next.localProvider || undefined;
  }
  if (baseline.approvalPolicy !== next.approvalPolicy) {
    patch.approvalPolicy = next.approvalPolicy;
  }
  if (baseline.sandboxEnabled !== next.sandboxEnabled) {
    patch.sandboxEnabled = next.sandboxEnabled;
  }
  if (baseline.sandboxMode !== next.sandboxMode) patch.sandboxMode = next.sandboxMode;
  if (baseline.webSearchEnabled !== next.webSearchEnabled) {
    patch.webSearchEnabled = next.webSearchEnabled;
  }
  if (baseline.reasoningEffort !== next.reasoningEffort) {
    patch.reasoningEffort = next.reasoningEffort;
  }
  if (baseline.historyEnabled !== next.historyEnabled) {
    patch.historyEnabled = next.historyEnabled;
  }
  if (baseline.personality !== next.personality) {
    patch.personality = next.personality;
  }
  if (baseline.historyMaxEntries !== next.historyMaxEntries) {
    const parsed = Number.parseInt(next.historyMaxEntries.trim(), 10);
    patch.historyMaxEntries =
      Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  if (baseline.featureMultiAgent !== next.featureMultiAgent) {
    patch.featureMultiAgent = next.featureMultiAgent;
  }
  if (baseline.featureRemoteModels !== next.featureRemoteModels) {
    patch.featureRemoteModels = next.featureRemoteModels;
  }
  if (baseline.featurePreventIdleSleep !== next.featurePreventIdleSleep) {
    patch.featurePreventIdleSleep = next.featurePreventIdleSleep;
  }
  return patch;
}

export function CodexConfigCard() {
  const { data, isLoading } = useCodexSettings();
  const updateSettings = useUpdateCodexSettings();
  const [draft, setDraft] = useState<CodexConfigDraft | null>(null);
  const [baselineDraft, setBaselineDraft] = useState<CodexConfigDraft | null>(
    null,
  );
  const [showAllUnsupported, setShowAllUnsupported] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const draftRef = useRef<CodexConfigDraft | null>(null);
  const baselineDraftRef = useRef<CodexConfigDraft | null>(null);
  const lastFailedSignatureRef = useRef<string | null>(null);

  const settings = data?.settings;
  const unsupportedKeys = data?.metadata?.unsupportedKeys || [];
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
    const dirty = draftsEqual(draftRef.current, baselineDraftRef.current) === false;
    setBaselineDraft(next);
    if (!dirty || !draftRef.current) {
      setDraft(next);
    }
  }, [settings]);

  useEffect(() => {
    if (unsupportedKeys.length <= 6) {
      setShowAllUnsupported(false);
    }
  }, [unsupportedKeys.length]);

  useEffect(() => {
    if (!draft || !baselineDraft || !hasChanges || updateSettings.isPending) return;
    if (lastFailedSignatureRef.current === draftSignature) return;

    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      setSaveError(null);
      try {
        const uiPatch = diffDraft(baselineDraft, draft);
        if (Object.keys(uiPatch).length === 0) {
          setSaveState("saved");
          return;
        }
        await updateSettings.mutateAsync(fromCodexUiPatch(uiPatch));
        setBaselineDraft(draft);
        baselineDraftRef.current = draft;
        setSaveState("saved");
        lastFailedSignatureRef.current = null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setSaveState("error");
        setSaveError(message);
        lastFailedSignatureRef.current = draftSignature;
        toast.error("Failed to auto-save Codex settings");
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    baselineDraft,
    draft,
    draftSignature,
    hasChanges,
    updateSettings,
    updateSettings.isPending,
  ]);

  const handleReset = () => {
    if (!draft || !baselineDraft) return;
    setDraft(baselineDraft);
    setSaveState("idle");
    setSaveError(null);
    lastFailedSignatureRef.current = null;
  };

  if (isLoading || !settings || !draft) {
    return (
      <Card className="card-hover-glow border-border/70 bg-card/95">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32" />
        </CardContent>
      </Card>
    );
  }

  const modelOptions = CODEX_MODEL_OPTIONS.some((m) => m.id === draft.model)
    ? CODEX_MODEL_OPTIONS
    : [{ id: draft.model, label: `${draft.model} (custom)` }, ...CODEX_MODEL_OPTIONS];

  const displayedUnsupportedKeys = showAllUnsupported
    ? unsupportedKeys
    : unsupportedKeys.slice(0, 6);

  return (
    <Card className="card-hover-glow border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          Codex Configuration
        </CardTitle>
        <CardDescription>
          Saved to ~/.codex/config.toml — applies to all Codex CLI sessions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            Changes auto-save after you stop editing.
          </div>
          {saveState === "saving" || updateSettings.isPending ? (
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

        <SettingRow
          label="Model"
          description="Default model for Codex sessions"
        >
          <Select
            value={draft.model}
            onValueChange={(value) =>
              setDraft((prev) => (prev ? { ...prev, model: value } : prev))
            }
          >
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          label="Approval Policy"
          description="How Codex handles tool and shell permission approvals"
        >
          <Select
            value={draft.approvalPolicy}
            onValueChange={(value) =>
              setDraft((prev) =>
                prev
                  ? {
                      ...prev,
                      approvalPolicy: value as CodexConfigDraft["approvalPolicy"],
                    }
                  : prev,
              )
            }
          >
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPROVAL_POLICIES.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          label="Sandbox Enabled"
          description="Use the Codex sandbox for tool execution"
        >
          <Switch
            checked={draft.sandboxEnabled}
            onCheckedChange={(checked) =>
              setDraft((prev) => (prev ? { ...prev, sandboxEnabled: checked } : prev))
            }
          />
        </SettingRow>

        <SettingRow
          label="Sandbox Mode"
          description="Filesystem access level when sandbox is enabled"
        >
          <Select
            value={draft.sandboxMode}
            onValueChange={(value) =>
              setDraft((prev) =>
                prev
                  ? {
                      ...prev,
                      sandboxMode: value as CodexConfigDraft["sandboxMode"],
                    }
                  : prev,
              )
            }
          >
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SANDBOX_MODES.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          label="Web Search"
          description="Allow Codex to use web search tools"
        >
          <Switch
            checked={draft.webSearchEnabled}
            onCheckedChange={(checked) =>
              setDraft((prev) =>
                prev ? { ...prev, webSearchEnabled: checked } : prev,
              )
            }
          />
        </SettingRow>

        <SettingRow
          label="Reasoning Effort"
          description="Default reasoning intensity for supported models"
        >
          <Select
            value={draft.reasoningEffort}
            onValueChange={(value) =>
              setDraft((prev) =>
                prev
                  ? {
                      ...prev,
                      reasoningEffort: value as CodexConfigDraft["reasoningEffort"],
                    }
                  : prev,
              )
            }
          >
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONING_EFFORTS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          label="Save History"
          description="Persist Codex session history on disk"
        >
          <Switch
            checked={draft.historyEnabled}
            onCheckedChange={(checked) =>
              setDraft((prev) =>
                prev ? { ...prev, historyEnabled: checked } : prev,
              )
            }
          />
        </SettingRow>

        <details className="rounded-md border bg-muted/20 p-3">
          <summary className="cursor-pointer text-xs font-medium">
            Advanced
          </summary>
          <div className="mt-3 space-y-3">
            <SettingRow
              label="Model Provider"
              description="Optional override for model provider routing"
            >
              <Select
                value={draft.modelProvider || "__auto__"}
                onValueChange={(value) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          modelProvider: value === "__auto__" ? "" : value,
                        }
                      : prev,
                  )
                }
              >
                <SelectTrigger className="h-8 w-48 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_PROVIDERS.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>

            {draft.modelProvider === "oss" && (
              <>
                <SettingRow
                  label="Local Provider"
                  description="Choose which local OSS host Codex should target"
                >
                  <Select
                    value={draft.localProvider || "__auto__"}
                    onValueChange={(value) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              localProvider:
                                value === "__auto__"
                                  ? ""
                                  : (value as "ollama" | "lmstudio"),
                            }
                          : prev,
                      )
                    }
                  >
                    <SelectTrigger className="h-8 w-48 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCAL_PROVIDERS.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>

                <div className="rounded-md border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  Setup: run Ollama (`ollama serve`) or start LM Studio local server,
                  then select the matching local provider here.
                </div>
              </>
            )}

            <SettingRow
              label="History Max Entries"
              description="Cap the number of persisted Codex history entries"
            >
              <Input
                value={draft.historyMaxEntries}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          historyMaxEntries: event.target.value,
                        }
                      : prev,
                  )
                }
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="No explicit cap"
                className="h-8 w-48 text-xs font-mono"
              />
            </SettingRow>

            <SettingRow
              label="Personality"
              description="Optional Codex response style profile"
            >
              <Input
                value={draft.personality}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          personality: event.target.value,
                        }
                      : prev,
                  )
                }
                placeholder="e.g. pragmatic"
                className="h-8 w-48 text-xs font-mono"
              />
            </SettingRow>

            <div className="rounded-md border border-border/70 bg-background/60 p-3">
              <div className="text-xs font-medium">Feature Flags</div>
              <div className="mt-2 space-y-1.5">
                <SettingRow
                  label="Remote Models"
                  description="Allow remote model access features in Codex"
                >
                  <Switch
                    checked={draft.featureRemoteModels}
                    onCheckedChange={(checked) =>
                      setDraft((prev) =>
                        prev ? { ...prev, featureRemoteModels: checked } : prev,
                      )
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Multi-Agent"
                  description="Enable Codex multi-agent orchestration features"
                >
                  <Switch
                    checked={draft.featureMultiAgent}
                    onCheckedChange={(checked) =>
                      setDraft((prev) =>
                        prev ? { ...prev, featureMultiAgent: checked } : prev,
                      )
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Prevent Idle Sleep"
                  description="Keep the machine awake while Codex is actively running"
                >
                  <Switch
                    checked={draft.featurePreventIdleSleep}
                    onCheckedChange={(checked) =>
                      setDraft((prev) =>
                        prev ? { ...prev, featurePreventIdleSleep: checked } : prev,
                      )
                    }
                  />
                </SettingRow>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              This card edits common Codex settings. Other keys in
              `~/.codex/config.toml` are preserved on save.
            </div>

            {unsupportedKeys.length > 0 && (
              <details className="rounded-md border border-warning/40 bg-warning/10 p-3">
                <summary className="cursor-pointer text-xs font-medium">
                  {unsupportedKeys.length} raw config{" "}
                  {unsupportedKeys.length === 1 ? "key" : "keys"} not modeled in UI
                </summary>
                <div className="mt-2 space-y-2">
                  <div className="text-xs text-muted-foreground">
                    These will be preserved exactly as-is.
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {displayedUnsupportedKeys.map((key) => (
                      <Badge key={key} variant="outline" className="font-mono">
                        {key}
                      </Badge>
                    ))}
                  </div>
                  {unsupportedKeys.length > 6 && (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => setShowAllUnsupported((v) => !v)}
                    >
                      {showAllUnsupported ? "Show fewer" : "Show all"}
                    </Button>
                  )}
                </div>
              </details>
            )}

            <div className="rounded-md border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
              `oss` means local open-source model provider mode (e.g. Ollama or
              LM Studio) instead of OpenAI cloud.
            </div>
          </div>
        </details>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasChanges || updateSettings.isPending}
            onClick={handleReset}
          >
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
