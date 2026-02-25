"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import type { CodexSettings } from "@/lib/codex/settings";

const CODEX_MODELS = [
  { id: "o3", label: "o3" },
  { id: "o4-mini", label: "o4-mini" },
  { id: "codex-mini-latest", label: "Codex Mini" },
];

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

const REASONING_EFFORTS = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

type CodexConfigDraft = {
  model: string;
  approvalPolicy: "untrusted" | "on-request" | "never";
  sandboxEnabled: boolean;
  sandboxMode: "read-only" | "workspace-write" | "danger-full-access";
  webSearchEnabled: boolean;
  reasoningEffort: "low" | "medium" | "high";
  historyEnabled: boolean;
};

function buildDraft(settings: CodexSettings): CodexConfigDraft {
  const ui = toCodexUiModel(settings);
  return {
    model: ui.model || "o3",
    approvalPolicy: ui.approvalPolicy || "on-request",
    sandboxEnabled: ui.sandboxEnabled ?? false,
    sandboxMode: ui.sandboxMode || "workspace-write",
    webSearchEnabled: ui.webSearchEnabled ?? false,
    reasoningEffort: ui.reasoningEffort || "medium",
    historyEnabled: ui.historyEnabled ?? true,
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
  return patch;
}

export function CodexConfigCard() {
  const { data, isLoading } = useCodexSettings();
  const updateSettings = useUpdateCodexSettings();
  const [draft, setDraft] = useState<CodexConfigDraft | null>(null);
  const [showAllUnsupported, setShowAllUnsupported] = useState(false);

  const settings = data?.settings;
  const unsupportedKeys = data?.metadata?.unsupportedKeys || [];
  const baselineDraft = settings ? buildDraft(settings) : null;
  const hasChanges = draftsEqual(draft, baselineDraft) === false;

  useEffect(() => {
    if (!settings) return;
    setDraft(buildDraft(settings));
  }, [settings]);

  useEffect(() => {
    if (unsupportedKeys.length <= 6) {
      setShowAllUnsupported(false);
    }
  }, [unsupportedKeys.length]);

  const handleSave = async () => {
    if (!draft || !baselineDraft) return;
    try {
      const uiPatch = diffDraft(baselineDraft, draft);
      await updateSettings.mutateAsync(fromCodexUiPatch(uiPatch));
      toast.success("Codex settings saved");
    } catch {
      toast.error("Failed to save Codex settings");
    }
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

  const modelOptions = CODEX_MODELS.some((m) => m.id === draft.model)
    ? CODEX_MODELS
    : [{ id: draft.model, label: `${draft.model} (custom)` }, ...CODEX_MODELS];

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
            Toggle common behaviors and save once.
          </div>
          {hasChanges && <Badge variant="warning">Unsaved changes</Badge>}
        </div>

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
            <div className="text-xs text-muted-foreground">
              This card edits common Codex settings. Other keys in your
              `~/.codex/config.toml` are preserved on save.
            </div>

            {unsupportedKeys.length > 0 ? (
              <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="warning">
                    {unsupportedKeys.length} unsupported{" "}
                    {unsupportedKeys.length === 1 ? "key" : "keys"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    These are valid config keys not modeled by this UI yet.
                  </span>
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
            ) : (
              <div className="text-xs text-muted-foreground">
                No unsupported keys detected.
              </div>
            )}
          </div>
        </details>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasChanges || updateSettings.isPending}
            onClick={() => setDraft(buildDraft(settings))}
          >
            Reset
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!hasChanges || updateSettings.isPending}
            onClick={handleSave}
          >
            {updateSettings.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
