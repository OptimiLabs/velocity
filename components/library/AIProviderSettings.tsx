"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Trash2, Key } from "lucide-react";
import {
  useProviders,
  useSaveProvider,
  useDeleteProvider,
} from "@/hooks/useInstructions";

interface AIProviderSettingsProps {
  onClose: () => void;
}

const PROVIDER_OPTIONS = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "custom", label: "Custom" },
] as const;

export function AIProviderSettings({ onClose }: AIProviderSettingsProps) {
  const [provider, setProvider] = useState<string>("anthropic");
  const [displayName, setDisplayName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");

  const { data: providers = [], isLoading } = useProviders();
  const saveProvider = useSaveProvider();
  const deleteProvider = useDeleteProvider();

  const handleSave = async () => {
    if (!displayName.trim() || !apiKey.trim()) return;
    await saveProvider.mutateAsync({
      provider,
      displayName: displayName.trim(),
      apiKey: apiKey.trim(),
      modelId: modelId.trim() || undefined,
      endpointUrl: endpointUrl.trim() || undefined,
    });
    setDisplayName("");
    setApiKey("");
    setModelId("");
    setEndpointUrl("");
  };

  const handleDelete = async (provider: string) => {
    await deleteProvider.mutateAsync(provider);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Key size={14} className="text-chart-3" />
          <span className="text-sm font-semibold text-foreground">
            AI Provider Settings
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onClose}
        >
          <X size={12} />
          Close
        </Button>
      </div>

      {/* Info */}
      <div className="px-4 py-3 border-b border-border bg-muted">
        <p className="text-xs text-muted-foreground">
          Configure API keys for AI-assisted instruction editing. Keys are
          stored locally (base64 encoded). The Claude CLI provider works without
          an API key.
        </p>
      </div>

      {/* Existing providers */}
      <div className="px-4 py-3 border-b border-border space-y-2">
        <span className="text-xs text-foreground font-semibold">
          Configured Providers
        </span>
        {isLoading ? (
          <div className="text-xs text-muted-foreground py-2">Loading...</div>
        ) : providers.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">
            No API keys configured. Claude CLI is always available.
          </div>
        ) : (
          <div className="space-y-1.5">
            {providers.map(
              (p: {
                provider: string;
                displayName: string;
                modelId: string | null;
                isActive: boolean;
              }) => (
                <div
                  key={p.provider}
                  className="flex items-center justify-between p-2.5 rounded-md border border-border bg-card"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="text-meta font-medium"
                    >
                      {p.provider}
                    </Badge>
                    <span className="text-xs font-semibold text-foreground">
                      {p.displayName}
                    </span>
                    {p.modelId && (
                      <span className="text-detail text-muted-foreground font-mono">
                        {p.modelId}
                      </span>
                    )}
                    <span className="text-meta text-muted-foreground">
                      key: ****
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(p.provider)}
                    className="p-1 hover:bg-destructive/20 rounded transition-colors"
                  >
                    <Trash2 size={12} className="text-muted-foreground" />
                  </button>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {/* Add new provider */}
      <div className="px-4 py-3 space-y-3">
        <span className="text-xs text-foreground font-semibold">
          Add Provider
        </span>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="h-8 text-xs px-2 bg-card border border-border rounded-md text-foreground"
          >
            {PROVIDER_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            className="h-8 text-xs"
          />
        </div>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API Key"
          className="h-8 text-xs"
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            placeholder="Model ID (optional)"
            className="h-8 text-xs"
          />
          {provider === "custom" && (
            <Input
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              placeholder="Endpoint URL"
              className="h-8 text-xs"
            />
          )}
        </div>
        <Button
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={handleSave}
          disabled={
            !displayName.trim() || !apiKey.trim() || saveProvider.isPending
          }
        >
          <Plus size={12} />
          {saveProvider.isPending ? "Saving..." : "Save Provider"}
        </Button>
      </div>
    </div>
  );
}
