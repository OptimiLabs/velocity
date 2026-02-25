"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  Bot,
  Globe,
  Network,
  HardDrive,
  CheckCircle2,
  Circle,
  ChevronRight,
  Loader2,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ProviderModelList } from "./ProviderModelList";
import {
  useSaveProvider,
  useDeleteProvider,
  useValidateProvider,
  useUpdateProviderConfig,
} from "@/hooks/useProviders";
import type {
  ProviderCatalogEntry,
  ProviderSlug,
} from "@/lib/providers/catalog";
import type { AIProvider } from "@/types/instructions";
import { toast } from "sonner";

const ICON_MAP: Record<string, LucideIcon> = {
  Sparkles,
  Bot,
  Globe,
  Network,
  HardDrive,
};

const SLUG_COLORS: Record<
  ProviderSlug,
  { bg: string; text: string; border: string }
> = {
  anthropic: {
    bg: "bg-orange-500/15",
    text: "text-orange-500 dark:text-orange-400",
    border: "border-orange-500/25",
  },
  openai: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-500 dark:text-emerald-400",
    border: "border-emerald-500/25",
  },
  google: {
    bg: "bg-blue-500/15",
    text: "text-blue-500 dark:text-blue-400",
    border: "border-blue-500/25",
  },
  openrouter: {
    bg: "bg-purple-500/15",
    text: "text-purple-500 dark:text-purple-400",
    border: "border-purple-500/25",
  },
  local: {
    bg: "bg-zinc-500/15",
    text: "text-zinc-500 dark:text-zinc-400",
    border: "border-zinc-500/25",
  },
};

type ProviderListItem = Omit<AIProvider, "apiKeyEncrypted">;

interface ProviderListRowProps {
  entry: ProviderCatalogEntry;
  liveData: ProviderListItem | null;
}

// --- Config input with on-blur save ---

function ConfigInput({
  label,
  value,
  placeholder,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number | null;
  placeholder: string;
  step?: string;
  min?: number;
  max?: number;
  onChange: (v: number | null) => void;
}) {
  const [local, setLocal] = useState(value?.toString() ?? "");

  // Sync from parent when liveData updates
  useEffect(() => {
    setLocal(value?.toString() ?? "");
  }, [value]);

  const handleBlur = () => {
    const trimmed = local.trim();
    if (trimmed === "") {
      onChange(null);
    } else {
      const num = parseFloat(trimmed);
      if (!isNaN(num)) onChange(num);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs text-text-tertiary">{label}</label>
      <Input
        type="number"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        step={step}
        min={min}
        max={max}
        className="h-8 text-sm tabular-nums font-mono"
      />
    </div>
  );
}

export function ProviderListRow({ entry, liveData }: ProviderListRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [endpointUrl, setEndpointUrl] = useState(
    entry.defaultEndpointUrl ?? "",
  );
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    error?: string;
  } | null>(null);

  const saveProvider = useSaveProvider();
  const deleteProvider = useDeleteProvider();
  const validateProvider = useValidateProvider();
  const updateConfig = useUpdateProviderConfig();

  const connected = !!liveData;
  const Icon = ICON_MAP[entry.iconName] ?? Sparkles;
  const colors = SLUG_COLORS[entry.slug];
  const hasEndpointField =
    entry.slug === "openrouter" || entry.slug === "local";

  // Debounced config save
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleConfigChange = useCallback(
    (field: string, value: number | null) => {
      if (!connected) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateConfig.mutate({
          providerSlug: entry.slug,
          [field]: value,
        });
      }, 300);
    },
    [connected, entry.slug, updateConfig],
  );

  const handleValidate = async () => {
    if (!apiKey.trim() && entry.slug !== "local") return;
    setValidationResult(null);
    const result = await validateProvider.mutateAsync({
      providerSlug: entry.slug,
      apiKey: apiKey.trim(),
      endpointUrl: endpointUrl.trim() || undefined,
    });
    setValidationResult(result);
  };

  const handleSave = async () => {
    if (!apiKey.trim() && entry.slug !== "local") return;
    await saveProvider.mutateAsync({
      provider: entry.dbProviderType,
      providerSlug: entry.slug,
      displayName: entry.name,
      apiKey: apiKey.trim() || "local",
      endpointUrl: endpointUrl.trim() || undefined,
    });
    toast.success(`${entry.name} connected`);
    setApiKey("");
    setValidationResult(null);
  };

  const handleDelete = async () => {
    await deleteProvider.mutateAsync(entry.slug);
    toast.success(`${entry.name} disconnected`);
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card transition-all",
        expanded && "shadow-sm",
      )}
    >
      {/* Collapsed row — always visible */}
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-muted/30 transition-colors rounded-xl"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Icon */}
        <div
          className={cn(
            "flex items-center justify-center w-9 h-9 rounded-lg border shrink-0",
            colors.bg,
            colors.border,
          )}
        >
          <Icon size={18} className={colors.text} />
        </div>

        {/* Name + description */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">
              {entry.name}
            </span>
            {connected ? (
              <Badge
                variant="outline"
                className="gap-1 text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/25"
              >
                <CheckCircle2 size={9} />
                Connected
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 text-[10px] px-1.5 py-0 text-text-tertiary border-border"
              >
                <Circle size={9} />
                Not set up
              </Badge>
            )}
          </div>
          <p className="text-xs text-text-tertiary mt-0.5 truncate">
            {entry.description}
          </p>
        </div>

        {/* Model count + chevron */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-text-tertiary tabular-nums hidden sm:inline">
            {entry.models.length} model{entry.models.length !== 1 ? "s" : ""}
          </span>
          <ChevronRight
            size={16}
            className={cn(
              "text-foreground/40 transition-transform duration-200",
              expanded && "rotate-90",
            )}
          />
        </div>
      </button>

      {/* Expanded section */}
      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1 space-y-5">
            <Separator />

            {/* Model Parameters — only show if connected */}
            {connected && (
              <>
                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Model Parameters
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <ConfigInput
                      label="Temperature"
                      value={liveData.temperature}
                      placeholder="Default"
                      step="0.1"
                      min={0}
                      max={2}
                      onChange={(v) => handleConfigChange("temperature", v)}
                    />
                    <ConfigInput
                      label="Top P"
                      value={liveData.topP}
                      placeholder="Default"
                      step="0.05"
                      min={0}
                      max={1}
                      onChange={(v) => handleConfigChange("topP", v)}
                    />
                    <ConfigInput
                      label="Top K"
                      value={liveData.topK}
                      placeholder="Default"
                      min={0}
                      onChange={(v) => handleConfigChange("topK", v)}
                    />
                    <ConfigInput
                      label="Max Tokens"
                      value={liveData.maxTokens}
                      placeholder="Default"
                      min={1}
                      onChange={(v) => handleConfigChange("maxTokens", v)}
                    />
                    <ConfigInput
                      label="Thinking Budget"
                      value={liveData.thinkingBudget}
                      placeholder="Default"
                      min={0}
                      onChange={(v) => handleConfigChange("thinkingBudget", v)}
                    />
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Connection section */}
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {entry.slug === "local" ? "Connection" : "API Key"}
              </div>

              {entry.slug !== "local" && (
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setValidationResult(null);
                  }}
                  placeholder={
                    connected
                      ? "Enter new key to replace existing"
                      : "Paste your API key"
                  }
                  className="h-9 text-sm font-mono"
                />
              )}

              {hasEndpointField && (
                <Input
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="Endpoint URL"
                  className="h-9 text-sm font-mono"
                />
              )}

              {/* Validation result */}
              {validationResult && (
                <div
                  className={cn(
                    "flex items-center gap-2 text-xs p-2.5 rounded-md border",
                    validationResult.valid
                      ? "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/25"
                      : "bg-destructive/10 text-destructive border-destructive/25",
                  )}
                >
                  {validationResult.valid ? (
                    <>
                      <ShieldCheck size={14} />
                      Connection successful
                    </>
                  ) : (
                    <>
                      <Circle size={14} />
                      {validationResult.error || "Connection failed"}
                    </>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleValidate}
                  disabled={
                    validateProvider.isPending ||
                    (!apiKey.trim() && entry.slug !== "local")
                  }
                >
                  {validateProvider.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={12} />
                  )}
                  Test
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleSave}
                  disabled={
                    saveProvider.isPending ||
                    (!apiKey.trim() && entry.slug !== "local")
                  }
                >
                  {saveProvider.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : null}
                  {connected ? "Update Key" : "Save & Connect"}
                </Button>
                {connected && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-text-tertiary hover:text-destructive ml-auto"
                    onClick={handleDelete}
                    disabled={deleteProvider.isPending}
                  >
                    <Trash2 size={12} />
                    Disconnect
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            {/* Models */}
            <ProviderModelList models={entry.models} />
          </div>
        </div>
      </div>
    </div>
  );
}
