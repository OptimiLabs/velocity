"use client";

import { Fragment, useState, useEffect, useCallback, type ReactNode } from "react";
import { ModelPicker } from "@/components/console/ModelPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Terminal,
  ExternalLink,
  Key,
  Eye,
  EyeOff,
  Trash2,
  Loader2,
  Info,
} from "lucide-react";
import type { ClaudeSettings } from "@/lib/claude-settings";
import type { AppSettings } from "@/lib/app-settings";

interface ModelProvidersCardProps {
  settings: ClaudeSettings;
  onUpdate?: (partial: Partial<ClaudeSettings>) => Promise<void>;
  codexCliEnabled?: boolean;
  geminiCliEnabled?: boolean;
  onUpdateApp?: (partial: Partial<AppSettings>) => Promise<void>;
  variant?: "full" | "claude" | "codex" | "gemini";
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
    {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GOOGLE_API_KEY",
    }[provider] ??
    `${provider.replace(/[^a-z0-9]/gi, "_").toUpperCase()}_API_KEY`;

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
  codexCliEnabled,
  geminiCliEnabled,
  onUpdateApp,
  variant = "full",
}: ModelProvidersCardProps) {
  const claudeCliEnabled = settings.claudeCliEnabled !== false;
  const codexRuntimeEnabled = codexCliEnabled !== false;
  const geminiRuntimeEnabled = geminiCliEnabled !== false;
  const showClaudeSections = variant === "full" || variant === "claude";
  const showOpenAI = variant === "full" || variant === "codex";
  const showGemini = variant === "gemini";
  const cardTitle =
    variant === "claude"
      ? "Claude Provider"
      : variant === "codex"
        ? "Codex Provider"
        : variant === "gemini"
          ? "Gemini Provider"
        : "Model & Provider";
  const cardDescription =
    variant === "claude"
      ? "Claude model defaults, CLI mode, and API credentials."
      : variant === "codex"
        ? "OpenAI credentials for Codex-related API features."
        : variant === "gemini"
          ? "Gemini CLI runtime toggle and Google API credentials."
        : "Default model and CLI configuration.";

  const handleClaudeUpdate = useCallback(
    (partial: Partial<ClaudeSettings>) => {
      if (!onUpdate) return;
      void onUpdate(partial);
    },
    [onUpdate],
  );
  const handleAppUpdate = useCallback(
    (partial: Partial<AppSettings>) => {
      if (!onUpdateApp) return;
      void onUpdateApp(partial);
    },
    [onUpdateApp],
  );

  const sections: Array<{ key: string; content: ReactNode }> = [];

  if (showClaudeSections) {
    sections.push({
      key: "default-model",
      content: (
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
            Model used for new Claude sessions when no override is set.
          </p>
          <div className="w-48">
            <ModelPicker
              value={settings.model as string | undefined}
              onChange={(model) => handleClaudeUpdate({ model })}
              showPricing
            />
          </div>
        </div>
      ),
    });

    sections.push({
      key: "claude-cli",
      content: (
        <div className="space-y-3">
          <div
            className={`flex items-center justify-between p-3 rounded-lg border ${
              claudeCliEnabled
                ? "border-border bg-background/70"
                : "border-border bg-muted/35"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center justify-center w-9 h-9 rounded-lg ${
                  claudeCliEnabled
                    ? "bg-white/70 dark:bg-white/10 border border-border/50"
                    : "bg-muted/60 border border-border/50"
                }`}
              >
                <Terminal
                  size={16}
                  className={claudeCliEnabled ? "text-foreground" : "text-muted-foreground"}
                />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground">
                    Claude CLI
                  </span>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Claude CLI cost note"
                        >
                          <Info size={12} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs leading-relaxed">
                        Claude CLI may automatically ingest additional system
                        prompts and runtime context, which can increase token
                        usage and total cost.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <span className="text-xs text-muted-foreground">
                  Run Claude via your local terminal installation
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={
                  claudeCliEnabled
                    ? "bg-muted text-foreground border-border"
                    : "bg-muted/70 text-muted-foreground border-border"
                }
              >
                {claudeCliEnabled ? "Enabled" : "Disabled"}
              </Badge>
              <Switch
                checked={claudeCliEnabled}
                onCheckedChange={(checked) =>
                  handleClaudeUpdate({ claudeCliEnabled: checked })
                }
                aria-label="Enable Claude CLI sessions"
              />
            </div>
          </div>
          <div className="rounded-md border border-border/70 bg-muted/20 p-2.5 text-meta text-muted-foreground space-y-1.5">
            <div className="flex items-start gap-1.5">
              <Info size={12} className="mt-0.5 shrink-0" />
              <span>
                Claude sessions open a local terminal and execute the{" "}
                <code>claude</code> command there.
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>
                Can be more expensive because they use the context tokens from
                your local Claude session.
              </span>
            </div>
          </div>
        </div>
      ),
    });

    sections.push({
      key: "anthropic-key",
      content: (
        <ProviderKeySection
          provider="anthropic"
          label="Anthropic"
          prefixHint="sk-ant-..."
        />
      ),
    });
  }

  if (showOpenAI) {
    if (variant === "codex") {
      sections.push({
        key: "codex-cli",
        content: (
          <div className="space-y-3">
            <div
              className={`flex items-center justify-between p-3 rounded-lg border ${
                codexRuntimeEnabled
                  ? "border-border bg-background/70"
                  : "border-border bg-muted/35"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex items-center justify-center w-9 h-9 rounded-lg ${
                    codexRuntimeEnabled
                      ? "bg-white/70 dark:bg-white/10 border border-border/50"
                      : "bg-muted/60 border border-border/50"
                  }`}
                >
                  <Terminal
                    size={16}
                    className={
                      codexRuntimeEnabled
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    Codex CLI
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Run Codex via your local terminal installation
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={
                    codexRuntimeEnabled
                      ? "bg-muted text-foreground border-border"
                      : "bg-muted/70 text-muted-foreground border-border"
                  }
                >
                  {codexRuntimeEnabled ? "Enabled" : "Disabled"}
                </Badge>
                <Switch
                  checked={codexRuntimeEnabled}
                  onCheckedChange={(checked) =>
                    handleAppUpdate({ codexCliEnabled: checked })
                  }
                  disabled={!onUpdateApp}
                  aria-label="Enable Codex CLI sessions"
                />
              </div>
            </div>
            <p className="text-meta text-muted-foreground">
              This controls whether Codex CLI is available for AI generation
              runtime flows.
            </p>
          </div>
        ),
      });
    }

    sections.push({
      key: "openai-key",
      content: (
        <ProviderKeySection
          provider="openai"
          label="OpenAI"
          prefixHint="sk-..."
        />
      ),
    });
  }

  if (showGemini) {
    sections.push({
      key: "gemini-cli",
      content: (
        <div className="space-y-3">
          <div
            className={`flex items-center justify-between p-3 rounded-lg border ${
              geminiRuntimeEnabled
                ? "border-border bg-background/70"
                : "border-border bg-muted/35"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center justify-center w-9 h-9 rounded-lg ${
                  geminiRuntimeEnabled
                    ? "bg-white/70 dark:bg-white/10 border border-border/50"
                    : "bg-muted/60 border border-border/50"
                }`}
              >
                <Terminal
                  size={16}
                  className={
                    geminiRuntimeEnabled
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">
                  Gemini CLI
                </span>
                <span className="text-xs text-muted-foreground">
                  Run Gemini via your local terminal installation
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={
                  geminiRuntimeEnabled
                    ? "bg-muted text-foreground border-border"
                    : "bg-muted/70 text-muted-foreground border-border"
                }
              >
                {geminiRuntimeEnabled ? "Enabled" : "Disabled"}
              </Badge>
              <Switch
                checked={geminiRuntimeEnabled}
                onCheckedChange={(checked) =>
                  handleAppUpdate({ geminiCliEnabled: checked })
                }
                disabled={!onUpdateApp}
                aria-label="Enable Gemini CLI sessions"
              />
            </div>
          </div>
          <p className="text-meta text-muted-foreground">
            This controls whether Gemini CLI is available for provider-specific
            runtime flows.
          </p>
        </div>
      ),
    });

    sections.push({
      key: "google-key",
      content: (
        <ProviderKeySection
          provider="google"
          label="Google AI"
          prefixHint="AIza..."
        />
      ),
    });
  }

  return (
    <Card id="providers" className="card-hover-glow border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sections.map((section, index) => (
          <Fragment key={section.key}>
            {index > 0 && <Separator />}
            {section.content}
          </Fragment>
        ))}
      </CardContent>
    </Card>
  );
}
