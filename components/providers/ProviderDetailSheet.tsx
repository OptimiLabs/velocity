"use client";

import { useState, useEffect } from "react";
import {
  Sparkles,
  Bot,
  Globe,
  Network,
  HardDrive,
  CheckCircle2,
  Circle,
  Loader2,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ProviderSetupGuide } from "./ProviderSetupGuide";
import { ProviderModelList } from "./ProviderModelList";
import {
  useSaveProvider,
  useDeleteProvider,
  useValidateProvider,
} from "@/hooks/useProviders";
import type { ProviderCatalogEntry } from "@/lib/providers/catalog";
import type { AIProvider } from "@/types/instructions";
import { toast } from "sonner";

const ICON_MAP: Record<string, LucideIcon> = {
  Sparkles,
  Bot,
  Globe,
  Network,
  HardDrive,
};

type ProviderListItem = Omit<AIProvider, "apiKeyEncrypted">;

interface ProviderDetailSheetProps {
  entry: ProviderCatalogEntry | null;
  liveData: ProviderListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProviderDetailSheet({
  entry,
  liveData,
  open,
  onOpenChange,
}: ProviderDetailSheetProps) {
  const [apiKey, setApiKey] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    error?: string;
  } | null>(null);

  const saveProvider = useSaveProvider();
  const deleteProvider = useDeleteProvider();
  const validateProvider = useValidateProvider();

  const connected = !!liveData;
  const hasEndpointField =
    entry?.slug === "openrouter" || entry?.slug === "local";

  // Reset form when entry changes
  useEffect(() => {
    setApiKey("");
    setEndpointUrl(entry?.defaultEndpointUrl ?? "");
    setValidationResult(null);
  }, [entry?.slug]);

  if (!entry) return null;

  const Icon = ICON_MAP[entry.iconName] ?? Sparkles;

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
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col"
        showCloseButton
      >
        {/* Header */}
        <SheetHeader className="shrink-0 pb-0">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-lg border",
                "bg-muted/50",
              )}
            >
              <Icon size={20} className="text-foreground/80" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base">{entry.name}</SheetTitle>
              <SheetDescription className="text-xs truncate">
                {entry.description}
              </SheetDescription>
            </div>
          </div>
          <div className="pt-2">
            {connected ? (
              <Badge
                variant="outline"
                className="gap-1 text-xs bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/25"
              >
                <CheckCircle2 size={12} />
                Connected
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 text-xs text-text-tertiary border-border"
              >
                <Circle size={12} />
                Not set up
              </Badge>
            )}
          </div>
        </SheetHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 space-y-5">
          {/* Setup Guide */}
          <ProviderSetupGuide
            steps={entry.setupSteps}
            dashboardUrl={entry.dashboardUrl}
          />

          <Separator />

          {/* API Key Form */}
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

            <div className="flex gap-2">
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
                Test Connection
              </Button>
            </div>
          </div>

          <Separator />

          {/* Model List */}
          <ProviderModelList models={entry.models} />
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 py-3 border-t border-border flex items-center justify-between gap-2">
          {connected && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-text-tertiary hover:text-destructive"
              onClick={handleDelete}
              disabled={deleteProvider.isPending}
            >
              <Trash2 size={12} />
              Disconnect
            </Button>
          )}
          <div className="ml-auto">
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
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
