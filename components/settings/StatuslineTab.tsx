"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Terminal,
  Activity,
} from "lucide-react";
import type { ClaudeSettings } from "@/lib/claude-settings";
import { useBlockUsage, PLAN_BUDGETS, PLAN_LABELS } from "@/hooks/useAnalytics";

interface StatuslineTabProps {
  settings: ClaudeSettings;
  onUpdate: (partial: Partial<ClaudeSettings>) => Promise<void>;
}

/** Installation-status fields returned by /api/statusline but not in BlockUsageData */
interface InstallStatus {
  fileExists: boolean;
  configured: boolean;
  scriptPath: string;
}

export function StatuslineTab({ settings, onUpdate }: StatuslineTabProps) {
  const queryClient = useQueryClient();
  const { data: blockData, isLoading: blockLoading } = useBlockUsage();

  // Separate query for install-status fields (no polling — only refetched after mutations)
  const { data: installStatus, isLoading: installLoading } =
    useQuery<InstallStatus>({
      queryKey: ["statusline-install"],
      queryFn: async () => {
        const res = await fetch("/api/statusline");
        if (!res.ok) throw new Error("Failed to fetch statusline");
        const json = await res.json();
        return {
          fileExists: json.fileExists,
          configured: json.configured,
          scriptPath: json.scriptPath,
        };
      },
    });

  const loading = blockLoading || installLoading;

  // Derive a combined `data` object for template compatibility
  const data =
    blockData && installStatus
      ? {
          block: blockData.block,
          plan: blockData.plan,
          ...installStatus,
          updatedAt: blockData.updatedAt,
        }
      : null;

  const [installing, setInstalling] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [script, setScript] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const plan = (settings.statuslinePlan as string) ?? "";

  const invalidateStatusline = () => {
    queryClient.invalidateQueries({ queryKey: ["block-usage"] });
    queryClient.invalidateQueries({ queryKey: ["statusline-install"] });
  };

  const handlePlanChange = async (value: string) => {
    const planValue = value === "none" ? undefined : value;
    await onUpdate({ statuslinePlan: planValue } as Partial<ClaudeSettings>);
  };

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const res = await fetch("/api/statusline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install" }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success("Statusline installed", {
          description: result.scriptPath,
        });
        invalidateStatusline();
      } else {
        toast.error("Install failed");
      }
    } catch {
      toast.error("Install failed");
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async () => {
    setInstalling(true);
    try {
      const res = await fetch("/api/statusline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "uninstall" }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success("Statusline removed");
        invalidateStatusline();
      }
    } catch {
      toast.error("Uninstall failed");
    } finally {
      setInstalling(false);
    }
  };

  const handleDeleteScript = async () => {
    setInstalling(true);
    try {
      const res = await fetch("/api/statusline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-script" }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success("Script file deleted");
        invalidateStatusline();
      }
    } catch {
      toast.error("Delete failed");
    } finally {
      setInstalling(false);
    }
  };

  const handleRemoveConfig = async () => {
    setInstalling(true);
    try {
      const res = await fetch("/api/statusline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-config" }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success("Statusline config removed from settings");
        invalidateStatusline();
      }
    } catch {
      toast.error("Remove failed");
    } finally {
      setInstalling(false);
    }
  };

  const toggleScript = async () => {
    if (!showScript && !script) {
      try {
        const res = await fetch("/api/statusline?script=true");
        const d = await res.json();
        setScript(d.script ?? null);
      } catch {
        /* ignore */
      }
    }
    setShowScript(!showScript);
  };

  const copyScript = async () => {
    if (script) {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Build preview output
  const renderPreview = () => {
    if (!data) return null;

    const cost = data.block.cost;
    const sessions = data.block.sessions;
    const budget = plan && PLAN_BUDGETS[plan];

    let resetStr = "";
    if (data.block.resetsAt) {
      const diff = new Date(data.block.resetsAt).getTime() - Date.now();
      if (diff > 0) {
        const hours = Math.floor(diff / 3_600_000);
        const mins = Math.floor((diff % 3_600_000) / 60_000);
        resetStr = hours > 0 ? `${hours}h${mins}m` : `${mins}m`;
      }
    }

    const pct = budget ? Math.min(100, Math.round((cost / budget) * 100)) : 0;
    const barWidth = 10;
    const filled = Math.round((pct / 100) * barWidth);

    return (
      <div className="font-mono text-sm leading-relaxed">
        <span className="text-cyan-400 dark:text-cyan-300 font-bold">[Opus]</span>{" "}
        <span className="text-foreground">42% ctx</span>
        <span className="text-muted-foreground"> | </span>
        <span className="text-green-400 dark:text-green-300">${(0.12).toFixed(2)}</span>
        <span className="text-foreground"> session</span>
        <span className="text-muted-foreground"> | </span>
        <span className="text-foreground">Block: </span>
        <span className="text-yellow-400 dark:text-yellow-300">${cost.toFixed(2)}</span>
        <span className="text-foreground">/5h</span>
        {budget ? (
          <>
            <span className="text-muted-foreground"> </span>
            <span className="text-muted-foreground/50">{"\u2590"}</span>
            {Array.from({ length: barWidth }).map((_, i) => (
              <span
                key={i}
                className={
                  i < filled
                    ? "bg-green-600 text-green-600 dark:bg-green-500 dark:text-green-500"
                    : "bg-muted text-muted"
                }
              >
                {"\u2588"}
              </span>
            ))}
            <span className="text-muted-foreground/50">{"\u258C"}</span>
            <span
              className={
                pct >= 90
                  ? "text-red-400 dark:text-red-300"
                  : pct >= 70
                    ? "text-yellow-400 dark:text-yellow-300"
                    : "text-green-400 dark:text-green-300"
              }
            >
              {" "}
              {pct}%
            </span>
          </>
        ) : (
          <span className="text-muted-foreground"> ({sessions} sessions)</span>
        )}
        {resetStr && (
          <>
            <span className="text-muted-foreground"> | resets {resetStr}</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Status indicator */}
      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium">Status</h3>
          {data?.fileExists && data?.configured ? (
            <Badge
              variant="outline"
              className="border-green-500/30 bg-green-500/10 text-green-400 dark:text-green-300 text-xs"
            >
              <Activity className="mr-1 h-3 w-3" />
              Active
            </Badge>
          ) : data?.configured && !data?.fileExists ? (
            <Badge
              variant="outline"
              className="border-yellow-500/30 bg-yellow-500/10 text-yellow-400 dark:text-yellow-300 text-xs"
            >
              Script missing
            </Badge>
          ) : data?.fileExists && !data?.configured ? (
            <Badge
              variant="outline"
              className="border-yellow-500/30 bg-yellow-500/10 text-yellow-400 dark:text-yellow-300 text-xs"
            >
              Not linked
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Not installed
            </Badge>
          )}
        </div>
        {data?.fileExists && (
          <p className="text-xs text-muted-foreground">
            Script: {data.scriptPath}
          </p>
        )}
        {data?.configured && !data?.fileExists && (
          <p className="text-xs text-yellow-400/80 dark:text-yellow-300/80">
            Settings reference a statusline script, but the file was deleted.
            Redownload it or remove the config.
          </p>
        )}
      </section>

      {/* Plan tier selector */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Plan Tier</h3>
        <p className="text-xs text-muted-foreground">
          Select your Claude plan to show block budget % in the statusline.
        </p>
        <div className="w-64">
          <Select value={plan || "none"} onValueChange={handlePlanChange}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Select plan..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (raw usage only)</SelectItem>
              <SelectItem value="pro">{PLAN_LABELS.pro}</SelectItem>
              <SelectItem value="max5x">{PLAN_LABELS.max5x}</SelectItem>
              <SelectItem value="max20x">{PLAN_LABELS.max20x}</SelectItem>
              <SelectItem value="api">{PLAN_LABELS.api}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Spending Alerts (API plan) */}
      {plan === "api" && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Spending Alerts</h3>
          <p className="text-xs text-muted-foreground">
            Set dollar thresholds to show spending progress bars on the API usage
            tab. Leave empty or 0 to disable.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              { key: "statuslineDailyAlert" as const, label: "Daily ($)", placeholder: "e.g. 50" },
              { key: "statuslineWeeklyAlert" as const, label: "Weekly ($)", placeholder: "e.g. 200" },
              { key: "statuslineMonthlyAlert" as const, label: "Monthly ($)", placeholder: "e.g. 500" },
            ] as const).map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1">
                <label className="text-xs text-muted-foreground">{label}</label>
                <input
                  type="number"
                  min={0}
                  step={5}
                  defaultValue={(settings[key] as number) ?? ""}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    if (val !== ((settings[key] as number) ?? 0)) {
                      onUpdate({ [key]: val || undefined } as Partial<ClaudeSettings>);
                    }
                  }}
                  className="h-8 w-full text-xs px-2.5 bg-card border border-border/50 rounded-md text-foreground tabular-nums"
                  placeholder={placeholder}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Install / Uninstall */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Installation</h3>
        <p className="text-xs text-muted-foreground">
          Install the statusline script to{" "}
          <code className="text-xs">~/.claude/statusline-usage.sh</code> and
          configure Claude Code to use it.
        </p>
        <div className="flex flex-wrap gap-2">
          {/* Neither installed nor configured → Install */}
          {!data?.fileExists && !data?.configured && (
            <Button size="sm" onClick={handleInstall} disabled={installing}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Install
            </Button>
          )}

          {/* Config exists but file deleted → Redownload + Remove config */}
          {!data?.fileExists && data?.configured && (
            <>
              <Button size="sm" onClick={handleInstall} disabled={installing}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Redownload Script
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRemoveConfig}
                disabled={installing}
                className="text-red-400 hover:text-red-300 dark:text-red-300 dark:hover:text-red-200"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Remove Config
              </Button>
            </>
          )}

          {/* Both file and config exist → Reinstall, Delete script, Uninstall */}
          {data?.fileExists && data?.configured && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleInstall}
                disabled={installing}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Reinstall
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDeleteScript}
                disabled={installing}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete Script
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleUninstall}
                disabled={installing}
                className="text-red-400 hover:text-red-300 dark:text-red-300 dark:hover:text-red-200"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Uninstall
              </Button>
            </>
          )}

          {/* File exists but not configured → Install (links config) + Delete script */}
          {data?.fileExists && !data?.configured && (
            <>
              <Button size="sm" onClick={handleInstall} disabled={installing}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Install
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDeleteScript}
                disabled={installing}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete Script
              </Button>
            </>
          )}
        </div>
      </section>

      {/* Live preview */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Live Preview</h3>
          {!loading && (
            <button
              onClick={() => invalidateStatusline()}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="rounded-lg border bg-zinc-950 p-4 overflow-x-auto">
          {loading ? (
            <div className="h-5 w-96 animate-pulse rounded bg-zinc-800" />
          ) : data ? (
            renderPreview()
          ) : (
            <p className="text-xs text-muted-foreground">
              Failed to load usage data
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Shows how the statusline will appear in your
          terminal.
        </p>
      </section>

      {/* Script preview */}
      <section className="space-y-2">
        <button
          onClick={toggleScript}
          className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground transition-colors"
        >
          {showScript ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <Terminal className="h-4 w-4" />
          View Script
        </button>
        {showScript && (
          <div className="relative">
            <button
              onClick={copyScript}
              className="absolute top-2 right-2 p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors text-zinc-400 hover:text-zinc-200"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-400 dark:text-green-300" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            <pre className="rounded-lg border bg-zinc-950 p-4 text-xs overflow-x-auto max-h-96 overflow-y-auto whitespace-pre">
              <code className="text-muted-foreground">
                {script || "Loading..."}
              </code>
            </pre>
          </div>
        )}
      </section>
    </div>
  );
}
