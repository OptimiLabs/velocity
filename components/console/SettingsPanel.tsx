"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  Search,
  Plus,
  Zap,
  Bug,
  Terminal,
  ChevronDown,
  ChevronRight,
  Server,
  Puzzle,
  Globe,
  Webhook,
  Brain,
  Gauge,
  Settings,
  MonitorCog,
} from "lucide-react";
import { toast } from "sonner";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useTools, useInvalidateTools } from "@/hooks/useTools";
import { useProviders } from "@/hooks/useProviders";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { findNode } from "@/lib/console/pane-tree";
import { DEFAULT_MODEL, MODELS } from "@/lib/console/models";
import { useConsole } from "@/components/providers/ConsoleProvider";
import { useProviderScopeStore } from "@/stores/providerScopeStore";
import {
  DEFAULT_APPEARANCE,
  FONT_FAMILIES,
  SCROLLBACK_OPTIONS,
  TERMINAL_THEMES,
} from "@/lib/console/terminal-settings";
import { Palette, Minus } from "lucide-react";

interface SettingsPanelProps {
  wsRef: React.RefObject<WebSocket | null>;
}

const OUTPUT_STYLES = [
  { value: "concise", label: "Concise" },
  { value: "explanatory", label: "Explanatory" },
  { value: "verbose", label: "Verbose" },
];

const EFFORT_LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
];

const ORPHAN_TIMEOUT_OPTIONS = [
  { value: 5 * 60 * 1000, label: "5 minutes" },
  { value: 30 * 60 * 1000, label: "30 minutes" },
  { value: 2 * 60 * 60 * 1000, label: "2 hours" },
  { value: 0, label: "Indefinite" },
];

const ENV_PRESETS: {
  label: string;
  icon: typeof Zap;
  env: Record<string, string>;
}[] = [
  { label: "Node Debug", icon: Bug, env: { NODE_OPTIONS: "--inspect" } },
  { label: "Verbose", icon: Terminal, env: { DEBUG: "*" } },
];

// --- Collapsible Section ---

function Section({
  title,
  icon: Icon,
  badge,
  defaultExpanded = false,
  children,
}: {
  title: string;
  icon: typeof Settings;
  badge?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="border-b border-border/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <Icon className="w-3 h-3 shrink-0" />
        {title}
        {badge && (
          <span className="ml-1 px-1.5 py-0 rounded-full bg-muted/50 text-[10px] text-muted-foreground/70">
            {badge}
          </span>
        )}
        <span className="ml-auto">
          {expanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </span>
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// --- Main Panel ---

export function SettingsPanel({
  wsRef,
}: SettingsPanelProps) {
  const providerScope = useProviderScopeStore((s) => s.providerScope);
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { mutate: updateSettings } = useUpdateSettings();
  const { data: tools = [] } = useTools(providerScope);
  const invalidateTools = useInvalidateTools(providerScope);
  const { data: providers = [] } = useProviders();
  const { activeSession, sendModelChange } = useConsole();

  // System env state
  const [env, setEnv] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [masked, setMasked] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Terminal persistence (orphan timeout) — read from settings, default 30 min
  const orphanTimeout = ((settings as Record<string, unknown> | undefined)?.orphanTimeoutMs as number) ?? 30 * 60 * 1000;

  // Terminal env form state
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const terminals = useConsoleLayoutStore((s) => s.terminals);
  const updateTerminalMeta = useConsoleLayoutStore((s) => s.updateTerminalMeta);
  const activePaneId = useConsoleLayoutStore((s) => s.activePaneId);
  const paneTree = useConsoleLayoutStore((s) => s.paneTree);

  // Derive active terminal (shell or Claude)
  const activeLeaf = activePaneId ? findNode(paneTree, activePaneId) : null;
  const derivedTermId = (() => {
    if (activeLeaf?.kind === "leaf") {
      if (activeLeaf.content.type === "terminal") {
        return activeLeaf.content.terminalId;
      }
    }
    return null;
  })();
  const targetMeta = derivedTermId ? terminals[derivedTermId] : null;

  // Fetch system env via WebSocket
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "env:current" && msg.env) {
          setEnv(msg.env);
        }
      } catch {
        // ignore
      }
    };

    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ type: "env:current" }));
    return () => ws.removeEventListener("message", handler);
  }, [wsRef]);

  // Derived data
  const mcpServers = useMemo(
    () => tools.filter((t) => t.type === "mcp"),
    [tools],
  );
  const plugins = useMemo(
    () => tools.filter((t) => t.type === "plugin"),
    [tools],
  );
  const connectedProviders = useMemo(() => providers.length, [providers]);

  const filteredEntries = useMemo(() => {
    const entries = Object.entries(env).sort(([a], [b]) => a.localeCompare(b));
    if (!filter) return entries;
    const lower = filter.toLowerCase();
    return entries.filter(
      ([k, v]) =>
        k.toLowerCase().includes(lower) || v.toLowerCase().includes(lower),
    );
  }, [env, filter]);

  // Handlers
  const handleUpdateSetting = useCallback(
    (key: string, value: unknown) => {
      updateSettings(
        { [key]: value },
        {
          onSuccess: () => {
            // For model changes, offer to apply to current session
            if (key === "model" && activeSession?.id && typeof value === "string") {
              toast.success("Default model updated", {
                description: "New sessions will use this model",
                action: {
                  label: "Apply to current session",
                  onClick: () => sendModelChange(activeSession.id, value),
                },
              });
            } else {
              toast.success("Setting updated", {
                description: "Saved — new sessions will use these defaults",
              });
            }
          },
          onError: () => toast.error("Failed to update setting"),
        },
      );
    },
    [updateSettings, activeSession?.id, sendModelChange],
  );

  const handleOrphanTimeoutChange = useCallback(
    (ms: number) => {
      // Persist to settings DB
      updateSettings(
        { orphanTimeoutMs: ms } as Parameters<typeof updateSettings>[0],
        {
          onSuccess: () => {
            // Send to server via WS
            const ws = wsRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "settings:orphan-timeout", timeoutMs: ms }));
            }
            toast.success("Terminal persistence updated", {
              description: ms === 0
                ? "Terminals will persist indefinitely"
                : `Terminals will persist for ${ORPHAN_TIMEOUT_OPTIONS.find((o) => o.value === ms)?.label ?? `${ms / 60000} min`}`,
            });
          },
          onError: () => toast.error("Failed to update setting"),
        },
      );
    },
    [wsRef, updateSettings],
  );

  const handleToggleMCP = useCallback(
    async (name: string, enabled: boolean) => {
      try {
        const res = await fetch(`/api/tools/mcp/toggle?provider=${providerScope}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, enabled }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || "Failed to toggle MCP server");
        }
        invalidateTools();
        toast.success(`MCP server ${enabled ? "enabled" : "disabled"}`, {
          description: "Restart sessions to apply",
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to toggle MCP server",
        );
      }
    },
    [invalidateTools, providerScope],
  );

  const handleTogglePlugin = useCallback(
    async (pluginId: string, enabled: boolean, installPath?: string) => {
      try {
        const res = await fetch("/api/tools/plugins", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pluginId, enabled, installPath }),
        });
        if (!res.ok) throw new Error();
        invalidateTools();
        toast.success(`Plugin ${enabled ? "enabled" : "disabled"}`, {
          description: "Restart Claude to apply",
        });
      } catch {
        toast.error("Failed to toggle plugin");
      }
    },
    [invalidateTools],
  );

  const handleCopy = useCallback((key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }, []);

  const maskValue = (v: string) => {
    if (!masked) return v;
    if (v.length <= 4) return "****";
    return v.slice(0, 4) + "***";
  };

  // Terminal env handlers
  const handleAddOverride = () => {
    if (!derivedTermId || !newKey.trim()) return;
    updateTerminalMeta(derivedTermId, {
      envOverrides: { ...targetMeta?.envOverrides, [newKey.trim()]: newValue },
    });
    setNewKey("");
    setNewValue("");
    setShowAdd(false);
  };

  const handleApplyPreset = (preset: Record<string, string>) => {
    if (!derivedTermId) return;
    updateTerminalMeta(derivedTermId, {
      envOverrides: { ...targetMeta?.envOverrides, ...preset },
    });
  };

  const hooksCount = settings?.hooks
    ? Object.values(settings.hooks).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
        0,
      )
    : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── A. Quick Actions Header (sticky) ── */}
      <div className="shrink-0 px-3 py-2.5 border-b border-border/50 bg-card/50 space-y-2.5">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Settings className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">
            Session Defaults
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground/60 mb-1">
          Applied when creating new sessions
        </div>

        {settingsLoading ? (
          <div className="text-detail text-muted-foreground text-center py-2">
            Loading...
          </div>
        ) : settings ? (
          <>
            {/* Model + Output Style row */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label htmlFor="setting-model" className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 mb-0.5 block">
                  Model
                </label>
                <select
                  id="setting-model"
                  value={
                    ((settings as Record<string, unknown>).model as string) ||
                    DEFAULT_MODEL
                  }
                  onChange={(e) => handleUpdateSetting("model", e.target.value)}
                  className="w-full h-7 text-xs px-1.5 bg-card border border-border rounded text-foreground"
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label htmlFor="setting-output" className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 mb-0.5 block">
                  Output
                </label>
                <select
                  id="setting-output"
                  value={
                    ((settings as Record<string, unknown>)
                      .outputStyle as string) || "concise"
                  }
                  onChange={(e) =>
                    handleUpdateSetting("outputStyle", e.target.value)
                  }
                  className="w-full h-7 text-xs px-1.5 bg-card border border-border rounded text-foreground"
                >
                  {OUTPUT_STYLES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Think toggle + Effort chips */}
            <div className="flex items-center gap-3">
              <button
                onClick={() =>
                  handleUpdateSetting(
                    "alwaysThinkingEnabled",
                    !(settings as Record<string, unknown>)
                      .alwaysThinkingEnabled,
                  )
                }
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  (settings as Record<string, unknown>).alwaysThinkingEnabled
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <Brain className="w-3 h-3" />
                Always Think
              </button>

              <div className="flex items-center gap-0.5 ml-auto">
                <span className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 mr-1.5">
                  Effort
                </span>
                {EFFORT_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    onClick={() =>
                      handleUpdateSetting("effortLevel", level.value)
                    }
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      ((settings as Record<string, unknown>).effortLevel ||
                        "medium") === level.value
                        ? "bg-primary/15 text-primary"
                        : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground/50 italic">
              Effort is set at session start and cannot be changed mid-session
            </div>
          </>
        ) : null}
      </div>

      {/* ── Scrollable sections ── */}
      <div className="flex-1 overflow-y-auto">
        {/* ── B. Terminal Environment ── */}
        {targetMeta && (
          <Section
            title={`Terminal: ${targetMeta.label}`}
            icon={Terminal}
            badge="new terminals only"
          >
            {/* Current overrides */}
            {targetMeta.envOverrides &&
              Object.keys(targetMeta.envOverrides).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {Object.entries(targetMeta.envOverrides).map(([k, v]) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-meta font-mono"
                    >
                      <span className="text-primary/80">{k}</span>
                      <span className="text-muted-foreground">=</span>
                      <span className="text-muted-foreground">{v}</span>
                    </span>
                  ))}
                </div>
              )}

            {/* Presets + Add */}
            <div className="flex items-center gap-1 flex-wrap">
              {ENV_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handleApplyPreset(preset.env)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-meta bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <preset.icon className="w-2.5 h-2.5" />
                  {preset.label}
                </button>
              ))}
              <button
                onClick={() => setShowAdd(!showAdd)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-meta bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-2.5 h-2.5" />
                Custom
              </button>
            </div>

            {/* Add override form */}
            {showAdd && (
              <div className="flex items-center gap-1 mt-2">
                <input
                  type="text"
                  placeholder="KEY"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="flex-1 bg-muted/30 rounded px-1.5 py-0.5 text-xs font-mono outline-none placeholder:text-muted-foreground"
                />
                <span className="text-muted-foreground text-xs">=</span>
                <input
                  type="text"
                  placeholder="value"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="flex-1 bg-muted/30 rounded px-1.5 py-0.5 text-xs font-mono outline-none placeholder:text-muted-foreground"
                  onKeyDown={(e) => e.key === "Enter" && handleAddOverride()}
                />
                <button
                  onClick={handleAddOverride}
                  className="px-2 py-0.5 rounded text-xs bg-primary/20 hover:bg-primary/30 text-primary transition-colors"
                >
                  Add
                </button>
              </div>
            )}
          </Section>
        )}

        {/* ── C. Terminal Appearance ── */}
        <Section title="Terminal Appearance" icon={Palette}>
          {(() => {
            const appearance = settings?.terminalAppearance ?? {};
            const fontSize = appearance.fontSize ?? DEFAULT_APPEARANCE.fontSize;
            const fontFamily = appearance.fontFamily ?? DEFAULT_APPEARANCE.fontFamily;
            const cursorStyle = appearance.cursorStyle ?? DEFAULT_APPEARANCE.cursorStyle;
            const cursorBlink = appearance.cursorBlink ?? DEFAULT_APPEARANCE.cursorBlink;
            const currentTheme = appearance.theme ?? DEFAULT_APPEARANCE.theme;
            const scrollback = appearance.scrollback ?? DEFAULT_APPEARANCE.scrollback;
            const sessionLogging = appearance.sessionLogging ?? DEFAULT_APPEARANCE.sessionLogging;
            const bellStyle = appearance.bellStyle ?? DEFAULT_APPEARANCE.bellStyle ?? "visual";
            const minimumContrastRatio = appearance.minimumContrastRatio ?? DEFAULT_APPEARANCE.minimumContrastRatio ?? 1;

            const updateAppearance = (patch: Record<string, unknown>) => {
              updateSettings(
                { terminalAppearance: { ...appearance, ...patch } } as Parameters<typeof updateSettings>[0],
                {
                  onSuccess: () => toast.success("Terminal appearance updated"),
                  onError: () => toast.error("Failed to update appearance"),
                },
              );
            };

            return (
              <div className="space-y-3">
                {/* Font Size */}
                <div>
                  <label htmlFor="setting-font-size" className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 mb-1 block">
                    Font Size
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => fontSize > 8 && updateAppearance({ fontSize: fontSize - 1 })}
                      disabled={fontSize <= 8}
                      className="w-7 h-7 flex items-center justify-center rounded border border-border bg-card hover:bg-muted/50 text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      id="setting-font-size"
                      type="number"
                      min={8}
                      max={24}
                      value={fontSize}
                      onChange={(e) => {
                        const v = Math.min(24, Math.max(8, Number(e.target.value)));
                        updateAppearance({ fontSize: v });
                      }}
                      className="w-12 h-7 text-xs text-center bg-card border border-border rounded text-foreground"
                    />
                    <button
                      onClick={() => fontSize < 24 && updateAppearance({ fontSize: fontSize + 1 })}
                      disabled={fontSize >= 24}
                      className="w-7 h-7 flex items-center justify-center rounded border border-border bg-card hover:bg-muted/50 text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="text-[10px] text-muted-foreground/60 ml-1">px</span>
                  </div>
                </div>

                {/* Font Family */}
                <div>
                  <label htmlFor="setting-font-family" className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 mb-1 block">
                    Font Family
                  </label>
                  <select
                    id="setting-font-family"
                    value={fontFamily}
                    onChange={(e) => updateAppearance({ fontFamily: e.target.value })}
                    className="w-full h-7 text-xs px-1.5 bg-card border border-border rounded text-foreground"
                  >
                    {FONT_FAMILIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cursor Style */}
                <div>
                  <label id="setting-cursor-style-label" className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 mb-1 block">
                    Cursor Style
                  </label>
                  <div className="flex gap-1">
                    {(["block", "underline", "bar"] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() => updateAppearance({ cursorStyle: style })}
                        className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                          cursorStyle === style
                            ? "bg-primary/15 text-primary"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {style.charAt(0).toUpperCase() + style.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cursor Blink */}
                <div className="flex items-center justify-between">
                  <label htmlFor="setting-cursor-blink" className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70">
                    Cursor Blink
                  </label>
                  <button
                    id="setting-cursor-blink"
                    onClick={() => updateAppearance({ cursorBlink: !cursorBlink })}
                    className={`relative w-8 h-4.5 rounded-full transition-colors ${
                      cursorBlink ? "bg-primary" : "bg-muted/50"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
                        cursorBlink ? "translate-x-3.5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Color Theme */}
                <div>
                  <label id="setting-color-theme-label" className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 mb-1 block">
                    Color Theme
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {Object.entries(TERMINAL_THEMES).map(([key, { label, theme }]) => (
                      <button
                        key={key}
                        onClick={() => updateAppearance({ theme: key })}
                        className={`flex flex-col items-center gap-1 p-2 rounded border transition-colors ${
                          currentTheme === key
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-foreground/30"
                        }`}
                      >
                        <div className="flex gap-0.5">
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: theme.background }} />
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: theme.foreground }} />
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: theme.blue }} />
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: theme.green }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scrollback */}
                <div>
                  <label htmlFor="setting-scrollback" className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 mb-1 block">
                    Scrollback
                  </label>
                  <select
                    id="setting-scrollback"
                    value={scrollback}
                    onChange={(e) => updateAppearance({ scrollback: Number(e.target.value) })}
                    className="w-full h-7 text-xs px-1.5 bg-card border border-border rounded text-foreground"
                  >
                    {SCROLLBACK_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} lines
                      </option>
                    ))}
                  </select>
                </div>

                {/* Session Logging */}
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="setting-session-logging" className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70">
                      Session Logging
                    </label>
                    <button
                      id="setting-session-logging"
                      onClick={() => updateAppearance({ sessionLogging: !sessionLogging })}
                      className={`relative w-8 h-4.5 rounded-full transition-colors ${
                        sessionLogging ? "bg-primary" : "bg-muted/50"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
                          sessionLogging ? "translate-x-3.5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    Log terminal output to ~/.claude/terminal-logs/
                  </p>
                </div>

                {/* Bell Style */}
                <div>
                  <label id="setting-bell-style-label" className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 mb-1 block">
                    Bell Style
                  </label>
                  <div className="flex gap-1">
                    {(["visual", "badge", "none"] as const).map((style) => (
                      <button
                        key={style}
                        onClick={() => updateAppearance({ bellStyle: style })}
                        className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                          bellStyle === style
                            ? "bg-primary/15 text-primary"
                            : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {style.charAt(0).toUpperCase() + style.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Minimum Contrast Ratio */}
                <div>
                  <label htmlFor="setting-contrast-ratio" className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 mb-1 block">
                    Minimum Contrast Ratio
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="setting-contrast-ratio"
                      type="range"
                      min={1}
                      max={7}
                      step={0.5}
                      value={minimumContrastRatio}
                      onChange={(e) => updateAppearance({ minimumContrastRatio: Number(e.target.value) })}
                      className="flex-1 h-1 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground w-8 text-right">{minimumContrastRatio}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {minimumContrastRatio >= 4.5 ? "WCAG AA compliant" : minimumContrastRatio > 1 ? "Enhanced contrast" : "Default"}
                  </p>
                </div>
              </div>
            );
          })()}
        </Section>

        {/* ── D. Infrastructure Grid ── */}
        <Section title="Infrastructure" icon={Server} defaultExpanded>
          <div className="grid grid-cols-2 gap-2">
            {/* Hooks card */}
            <a
              href="/hooks"
              className="flex items-center gap-2 p-2 rounded-md border border-border/40 bg-muted/10 hover:bg-muted/20 transition-colors group"
            >
              <Webhook className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
              <div>
                <div className="text-xs font-medium text-foreground">Hooks</div>
                <div className="text-[10px] text-muted-foreground">
                  {hooksCount} configured
                </div>
              </div>
            </a>

            {/* Providers card */}
            <a
              href="/settings"
              className="flex items-center gap-2 p-2 rounded-md border border-border/40 bg-muted/10 hover:bg-muted/20 transition-colors group"
            >
              <Globe className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
              <div>
                <div className="text-xs font-medium text-foreground">
                  Providers
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {connectedProviders} connected
                </div>
              </div>
            </a>
          </div>

          {/* MCP Servers */}
          {mcpServers.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 mb-1">
                MCP Servers
              </div>
              <div className="space-y-0.5">
                {mcpServers.map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center gap-1.5 py-0.5"
                  >
                    <Server className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-mono text-muted-foreground truncate flex-1">
                      {s.name}
                    </span>
                    <button
                      onClick={() =>
                        handleToggleMCP(s.name, !s.enabled)
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        s.enabled
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                      }`}
                      title={s.enabled ? "Disable MCP server" : "Enable MCP server"}
                    >
                      {s.enabled ? "on" : "off"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plugins */}
          {plugins.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 mb-1">
                Plugins
              </div>
              <div className="space-y-0.5">
                {plugins.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center gap-1.5 py-0.5"
                  >
                    <Puzzle className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-mono text-muted-foreground truncate flex-1">
                      {p.name}
                    </span>
                    <button
                      onClick={() =>
                        handleTogglePlugin(
                          p.pluginId || p.name,
                          !p.enabled,
                          p.installPath,
                        )
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        p.enabled
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {p.enabled ? "on" : "off"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* ── E. Advanced ── */}
        {settings && (
          <Section title="Advanced" icon={MonitorCog}>
            {/* Memory cleanup */}
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70">
                Memory Cleanup
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Max age (days)
                </span>
                <select
                  value={
                    ((settings as Record<string, unknown>)
                      .memoryMaxAgeDays as number) ?? 3
                  }
                  onChange={(e) =>
                    handleUpdateSetting(
                      "memoryMaxAgeDays",
                      Number(e.target.value),
                    )
                  }
                  className="h-7 text-xs px-1.5 bg-card border border-border rounded text-foreground"
                >
                  {[1, 2, 3, 5, 7, 14].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Max files</span>
                <select
                  value={
                    ((settings as Record<string, unknown>)
                      .memoryMaxFiles as number) ?? 5
                  }
                  onChange={(e) =>
                    handleUpdateSetting(
                      "memoryMaxFiles",
                      Number(e.target.value),
                    )
                  }
                  className="h-7 text-xs px-1.5 bg-card border border-border rounded text-foreground"
                >
                  {[3, 5, 10, 15, 20].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Terminal Persistence */}
            <div className="mt-3 pt-2 border-t border-border/30">
              <div className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 mb-1">
                Terminal Persistence
              </div>
              <p className="text-[10px] text-muted-foreground/60 mb-1.5">
                How long shell processes survive after disconnect
              </p>
              <select
                value={orphanTimeout}
                onChange={(e) => handleOrphanTimeoutChange(Number(e.target.value))}
                className="w-full h-7 text-xs px-1.5 bg-card border border-border rounded text-foreground"
              >
                {ORPHAN_TIMEOUT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Statusline summary */}
            {settings.statuslinePlan && (
              <div className="mt-3 pt-2 border-t border-border/30">
                <div className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 mb-1">
                  Statusline
                </div>
                <div className="flex items-center gap-2">
                  <Gauge className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Plan: {settings.statuslinePlan}
                  </span>
                  {settings.statuslineAlertAt && (
                    <span className="text-xs text-muted-foreground/60">
                      Alert at{" "}
                      {settings.statuslinePlan === "api"
                        ? `$${settings.statuslineAlertAt}`
                        : `${settings.statuslineAlertAt}%`}
                    </span>
                  )}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* ── F. System Environment ── */}
        <Section title="System Environment" icon={MonitorCog}>
          {/* Search + mask toggle */}
          <div className="flex items-center gap-1.5 mb-2">
            <div className="flex-1 flex items-center gap-1 bg-muted/30 rounded px-1.5 py-0.5">
              <Search className="w-2.5 h-2.5 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Filter variables..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <button
              onClick={() => setMasked(!masked)}
              className="p-1 rounded hover:bg-muted/30 text-muted-foreground"
              title={masked ? "Show values" : "Mask values"}
            >
              {masked ? (
                <EyeOff className="w-3 h-3" />
              ) : (
                <Eye className="w-3 h-3" />
              )}
            </button>
            <span className="text-[10px] text-muted-foreground/60">
              {filteredEntries.length} / {Object.keys(env).length}
            </span>
          </div>

          {/* Table */}
          <div className="max-h-[300px] overflow-auto rounded border border-border/30">
            <table className="table-readable w-full text-xs">
              <tbody>
                {filteredEntries.map(([key, value], i) => (
                  <tr
                    key={key}
                    className={`group ${i % 2 === 0 ? "bg-transparent" : "bg-muted/10"} hover:bg-muted/20`}
                  >
                    <td className="px-2 py-1 font-mono text-meta font-medium text-foreground/80 whitespace-nowrap">
                      {key}
                    </td>
                    <td className="px-2 py-1 font-mono text-meta text-muted-foreground truncate max-w-[300px]">
                      {maskValue(value)}
                    </td>
                    <td className="w-8 px-1">
                      <button
                        onClick={() => handleCopy(key, value)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted/30 transition-opacity"
                        title="Copy value"
                      >
                        {copiedKey === key ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-muted-foreground" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredEntries.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-6 text-center text-muted-foreground/50 text-detail"
                    >
                      {Object.keys(env).length === 0
                        ? "Loading..."
                        : "No matching variables"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
