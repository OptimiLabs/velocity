"use client";

import { useState, useEffect, useCallback } from "react";
import { ModelPicker } from "@/components/console/ModelPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Terminal,
  ExternalLink,
  Key,
  Eye,
  EyeOff,
  Trash2,
  Loader2,
} from "lucide-react";
import type { ClaudeSettings } from "@/lib/claude-settings";

interface ModelProvidersCardProps {
  settings: ClaudeSettings;
  onUpdate: (partial: Partial<ClaudeSettings>) => Promise<void>;
}

type KeyStatus = {
  hasKey: boolean;
  source: "db" | "env" | null;
};

// ---------------------------------------------------------------------------
// Reusable provider key section
// ---------------------------------------------------------------------------

interface ProviderKeySectionProps {
  provider: string;
  label: string;
  prefixHint: string;
}

function ProviderKeySection({
  provider,
  label,
  prefixHint,
}: ProviderKeySectionProps) {
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({
    hasKey: false,
    source: null,
  });
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchKeyStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/settings/api-key?provider=${provider}`);
      if (res.ok) {
        setKeyStatus(await res.json());
      }
    } catch {
      // ignore
    }
  }, [provider]);

  useEffect(() => {
    fetchKeyStatus();
  }, [fetchKeyStatus]);

  const handleSaveKey = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/api-key?provider=${provider}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: keyInput.trim() }),
      });
      if (res.ok) {
        setKeyInput("");
        await fetchKeyStatus();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/api-key?provider=${provider}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchKeyStatus();
      }
    } finally {
      setSaving(false);
    }
  };

  const envVarName =
    provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Key size={14} className="text-muted-foreground" />
        <span className="text-xs font-medium">{label} API Key</span>
        {keyStatus.hasKey && (
          <Badge
            variant="secondary"
            className={
              keyStatus.source === "env"
                ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            }
          >
            {keyStatus.source === "env" ? "Env var detected" : "Active"}
          </Badge>
        )}
        {!keyStatus.hasKey && (
          <Badge variant="secondary" className="text-muted-foreground">
            Not configured
          </Badge>
        )}
      </div>
      <p className="text-meta text-muted-foreground">
        Optional — enables direct API path for AI features like instruction
        editing.
      </p>

      {keyStatus.source === "env" ? (
        <p className="text-xs text-blue-400/80">
          Using {envVarName} from environment variables.
        </p>
      ) : keyStatus.source === "db" ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-1.5 rounded-md border border-border bg-muted/50 text-xs text-muted-foreground font-mono">
            {prefixHint.replace(/\.{3}$/, "")}•••••••••••••••
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={handleDeleteKey}
            disabled={saving}
            title="Remove API key"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? "text" : "password"}
              placeholder={prefixHint}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="h-8 text-xs font-mono pr-8"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveKey();
              }}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={handleSaveKey}
            disabled={!keyInput.trim() || saving}
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin mr-1" />
            ) : null}
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function ModelProvidersCard({
  settings,
  onUpdate,
}: ModelProvidersCardProps) {
  return (
    <Card id="providers" className="card-hover-glow border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          Model & Provider
        </CardTitle>
        <CardDescription>Default model and CLI configuration.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Default Model */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Default Model</span>
            <a
              href="https://www.anthropic.com/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="View Anthropic pricing"
            >
              <ExternalLink size={12} />
            </a>
          </div>
          <p className="text-meta text-muted-foreground">
            Model used for new sessions when no override is set.
          </p>
          <div className="w-56">
            <ModelPicker
              value={settings.model as string | undefined}
              onChange={(model) => onUpdate({ model })}
              showPricing
            />
          </div>
        </div>

        <Separator />

        {/* Claude CLI — always present */}
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg border border-border border-l-2 border-l-emerald-500 bg-emerald-500/5">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/15">
                <Terminal size={16} className="text-emerald-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">
                  Claude CLI
                </span>
                <span className="text-xs text-muted-foreground">
                  Always available — uses your local Claude installation
                </span>
              </div>
            </div>
            <Badge
              variant="secondary"
              className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            >
              Active
            </Badge>
          </div>
        </div>

        <Separator />

        {/* Anthropic API Key */}
        <ProviderKeySection
          provider="anthropic"
          label="Anthropic"
          prefixHint="sk-ant-..."
        />

        <Separator />

        {/* OpenAI API Key */}
        <ProviderKeySection
          provider="openai"
          label="OpenAI"
          prefixHint="sk-..."
        />
      </CardContent>
    </Card>
  );
}
