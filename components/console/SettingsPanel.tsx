"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  MonitorCog,
  Info,
  Variable,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useAppSettings, useUpdateAppSettings } from "@/hooks/useAppSettings";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { findNode } from "@/lib/console/pane-tree";
import { useConsole } from "@/components/providers/ConsoleProvider";
import {
  DEFAULT_APPEARANCE,
  FONT_FAMILIES,
  SCROLLBACK_OPTIONS,
  TERMINAL_THEMES,
} from "@/lib/console/terminal-settings";
import { Palette, Minus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SettingsPanelProps {
  wsRef: React.RefObject<WebSocket | null>;
  terminalId?: string;
}

const ORPHAN_TIMEOUT_OPTIONS = [
  { value: 5 * 60 * 1000, label: "5 minutes" },
  { value: 30 * 60 * 1000, label: "30 minutes" },
  { value: 2 * 60 * 60 * 1000, label: "2 hours" },
  { value: 0, label: "Indefinite" },
];

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseEnvAssignments(input: string): Record<string, string> {
  const patch: Record<string, string> = {};
  const lines = input.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const assignment = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;
    const eqIndex = assignment.indexOf("=");
    if (eqIndex <= 0) {
      throw new Error(`Line ${i + 1}: expected KEY=value or export KEY=value`);
    }

    const key = assignment.slice(0, eqIndex).trim();
    if (!ENV_KEY_PATTERN.test(key)) {
      throw new Error(`Line ${i + 1}: invalid env key "${key}"`);
    }

    let value = assignment.slice(eqIndex + 1).trim();
    const wrappedInMatchingQuotes =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")));
    if (wrappedInMatchingQuotes) {
      value = value.slice(1, -1);
    }

    patch[key] = value;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("Enter at least one env assignment.");
  }

  return patch;
}

// --- Collapsible Section ---

function Section({
  title,
  icon: Icon,
  badge,
  defaultExpanded = false,
  children,
}: {
  title: string;
  icon: LucideIcon;
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
  terminalId,
}: SettingsPanelProps) {
  const { data: settings } = useSettings();
  const { mutate: updateSettings } = useUpdateSettings();
  const { data: appSettings } = useAppSettings();
  const { mutate: updateAppSettings } = useUpdateAppSettings();
  const { sessions, activeSession, updateSessionEnv } = useConsole();

  // Terminal persistence (orphan timeout) — read from settings, default 30 min
  const orphanTimeout =
    appSettings?.orphanTimeoutMs ??
    ((settings as Record<string, unknown> | undefined)?.orphanTimeoutMs as
      | number
      | undefined) ??
    30 * 60 * 1000;

  // Terminal env form state
  const [quickEnvInput, setQuickEnvInput] = useState("");
  const [saveToDotEnv, setSaveToDotEnv] = useState(true);
  const [useCustomDotEnvFolder, setUseCustomDotEnvFolder] = useState(false);
  const [customDotEnvFolder, setCustomDotEnvFolder] = useState("");
  const [consoleSettingsOpen, setConsoleSettingsOpen] = useState(true);
  const [applyingQuickEnv, setApplyingQuickEnv] = useState(false);

  const terminals = useConsoleLayoutStore((s) => s.terminals);
  const updateTerminalMeta = useConsoleLayoutStore((s) => s.updateTerminalMeta);
  const activePaneId = useConsoleLayoutStore((s) => s.activePaneId);
  const paneTree = useConsoleLayoutStore((s) => s.paneTree);

  // Derive active terminal (shell or provider CLI)
  const activeLeaf = activePaneId ? findNode(paneTree, activePaneId) : null;
  const derivedTermId = (() => {
    if (activeLeaf?.kind === "leaf") {
      if (activeLeaf.content.type === "terminal") {
        return activeLeaf.content.terminalId;
      }
    }
    return null;
  })();
  const targetTerminalId = terminalId ?? derivedTermId;
  const targetMeta = targetTerminalId ? terminals[targetTerminalId] : null;
  const targetSession = useMemo(() => {
    const metaSessionId = targetMeta?.sessionId;
    if (metaSessionId && sessions.has(metaSessionId)) {
      return sessions.get(metaSessionId) ?? null;
    }
    // When no explicit terminal is provided, fall back to current active session.
    if (!terminalId) return activeSession ?? null;
    return null;
  }, [targetMeta?.sessionId, sessions, terminalId, activeSession]);
  const targetSessionTerminalMeta = useMemo(() => {
    if (targetTerminalId && terminals[targetTerminalId]) {
      return terminals[targetTerminalId];
    }
    if (targetSession?.terminalId && terminals[targetSession.terminalId]) {
      return terminals[targetSession.terminalId];
    }
    if (!targetSession?.id) return null;
    return (
      Object.values(terminals).find((meta) => meta.sessionId === targetSession.id) ??
      null
    );
  }, [targetTerminalId, targetSession?.id, targetSession?.terminalId, terminals]);
  const activeRuntimeCwd =
    targetMeta?.cwd ?? targetSessionTerminalMeta?.cwd ?? targetSession?.cwd ?? null;
  const dotEnvTargetFolder = useMemo(() => {
    if (useCustomDotEnvFolder) {
      const value = customDotEnvFolder.trim();
      return value.length > 0 ? value : null;
    }
    return activeRuntimeCwd;
  }, [activeRuntimeCwd, customDotEnvFolder, useCustomDotEnvFolder]);

  useEffect(() => {
    if (!useCustomDotEnvFolder || customDotEnvFolder.trim()) return;
    if (!activeRuntimeCwd) return;
    setCustomDotEnvFolder(activeRuntimeCwd);
  }, [activeRuntimeCwd, customDotEnvFolder, useCustomDotEnvFolder]);

  const upsertFolderEnvEntries = useCallback(
    async (entries: Array<[string, string]>) => {
      if (!dotEnvTargetFolder) {
        throw new Error("No target folder selected to write .env");
      }
      for (const [key, value] of entries) {
        const res = await fetch("/api/console/env", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cwd: dotEnvTargetFolder,
            key,
            value,
          }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(payload.error || "Failed to update .env file");
        }
      }
    },
    [dotEnvTargetFolder],
  );

  const sendLiveExports = useCallback(
    (entries: Array<[string, string]>) => {
      if (!targetTerminalId) return false;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      const data = entries
        .map(([key, value]) => {
          const escaped = `'${value.replace(/'/g, `'\"'\"'`)}'`;
          return `export ${key}=${escaped}`;
        })
        .join("\n");
      ws.send(
        JSON.stringify({
          type: "pty:input",
          terminalId: targetTerminalId,
          data: `${data}\n`,
        }),
      );
      return true;
    },
    [targetTerminalId, wsRef],
  );

  // Handlers
  const handleUpdateSetting = useCallback(
    (key: string, value: unknown) => {
      updateSettings(
        { [key]: value },
        {
          onSuccess: () => {
            toast.success("Setting updated", {
              description: "Saved successfully",
            });
          },
          onError: () => toast.error("Failed to update setting"),
        },
      );
    },
    [updateSettings],
  );

  const handleQuickEnvApply = useCallback(async () => {
    const hasSessionTarget = Boolean(targetSession?.id);
    const hasTerminalTarget = Boolean(targetTerminalId);
    if (!hasSessionTarget && !hasTerminalTarget && !saveToDotEnv) {
      toast.error("No active target", {
        description: "Open a terminal session or enable .env save.",
      });
      return;
    }
    if (saveToDotEnv && !dotEnvTargetFolder) {
      toast.error("No target folder selected", {
        description: "Pick a folder before writing to .env.",
      });
      return;
    }

    setApplyingQuickEnv(true);
    try {
      const patch = parseEnvAssignments(quickEnvInput);
      const entries = Object.entries(patch);
      let wroteDotEnvCount = 0;
      let liveApplied = false;
      const shellLikeTarget =
        Boolean(targetTerminalId) &&
        (targetSession?.kind === "shell" ||
          (!targetSession && !targetMeta?.command));

      if (hasSessionTarget && targetSession?.id) {
        updateSessionEnv(targetSession.id, patch);
      } else if (targetTerminalId) {
        updateTerminalMeta(targetTerminalId, {
          envOverrides: { ...targetMeta?.envOverrides, ...patch },
        });
      }

      if (shellLikeTarget) {
        liveApplied = sendLiveExports(entries);
      }

      if (saveToDotEnv) {
        await upsertFolderEnvEntries(entries);
        wroteDotEnvCount = entries.length;
      }

      const descriptions: string[] = [];
      if (hasSessionTarget) {
        if (targetSession?.kind === "shell") {
          if (liveApplied) {
            descriptions.push("Applied to selected shell session.");
          } else {
            descriptions.push(
              "Saved for selected shell session. Re-open terminal to apply now.",
            );
          }
        } else {
          descriptions.push(
            "Saved to selected CLI session env. Restart session to apply now.",
          );
        }
      } else if (hasTerminalTarget) {
        if (shellLikeTarget && liveApplied) {
          descriptions.push("Applied to selected shell terminal.");
        } else if (shellLikeTarget) {
          descriptions.push(
            "Saved to terminal overrides. Re-open terminal to apply now.",
          );
        } else {
          descriptions.push("Saved to terminal overrides.");
        }
      }
      if (wroteDotEnvCount > 0) {
        descriptions.push(
          wroteDotEnvCount === 1
            ? "Updated .env file."
            : `Updated ${wroteDotEnvCount} entries in .env.`,
        );
      }

      toast.success(
        entries.length === 1
          ? "Environment variable saved"
          : "Environment variables saved",
        {
          description: descriptions.join(" "),
        },
      );
      setQuickEnvInput("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save env variable",
      );
    } finally {
      setApplyingQuickEnv(false);
    }
  }, [
    quickEnvInput,
    dotEnvTargetFolder,
    saveToDotEnv,
    sendLiveExports,
    targetSession?.id,
    targetSession?.kind,
    targetTerminalId,
    targetMeta?.command,
    targetMeta?.envOverrides,
    upsertFolderEnvEntries,
    updateSessionEnv,
    updateTerminalMeta,
  ]);

  const handleOrphanTimeoutChange = useCallback(
    (ms: number) => {
      // Persist to app settings so it stays in sync with Settings -> Core
      updateAppSettings(
        { orphanTimeoutMs: ms },
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
    [wsRef, updateAppSettings],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── A. Env Header (sticky) ── */}
      <div className="shrink-0 px-3 py-2.5 border-b border-border/50 bg-card/50">
        <button
          type="button"
          onClick={() => setConsoleSettingsOpen((v) => !v)}
          className="w-full flex items-center gap-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Variable className="w-3.5 h-3.5 text-muted-foreground" />
          <span>Env</span>
          <span className="ml-auto text-muted-foreground">
            {consoleSettingsOpen ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </span>
        </button>

        {consoleSettingsOpen && (
          <div className="mt-2 space-y-2">
            <div className="space-y-1">
              <textarea
                placeholder={"export OPENAI_API_KEY=sk-...\nANTHROPIC_API_KEY=...\n# comments are ignored"}
                value={quickEnvInput}
                onChange={(e) => setQuickEnvInput(e.target.value)}
                className="w-full min-h-[62px] px-1.5 py-1 text-xs font-mono bg-card border border-border rounded text-foreground resize-y"
              />
              <div className="text-[10px] text-muted-foreground/70">
                Accepts `export KEY=value` or `KEY=value` lines.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveToDotEnv}
                  onChange={(e) => setSaveToDotEnv(e.target.checked)}
                  className="accent-primary"
                />
                Save to `.env`
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustomDotEnvFolder}
                  onChange={(e) => setUseCustomDotEnvFolder(e.target.checked)}
                  className="accent-primary"
                  disabled={!saveToDotEnv}
                />
                Custom folder
              </label>
            </div>
            {saveToDotEnv && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 block">
                  Target .env Folder
                </label>
                <input
                  type="text"
                  value={
                    useCustomDotEnvFolder
                      ? customDotEnvFolder
                      : (dotEnvTargetFolder ?? "")
                  }
                  onChange={(e) => setCustomDotEnvFolder(e.target.value)}
                  disabled={!useCustomDotEnvFolder}
                  placeholder={activeRuntimeCwd ?? "~/project"}
                  className="w-full h-7 px-1.5 text-xs font-mono bg-card border border-border rounded text-foreground disabled:opacity-60"
                />
                <div className="text-[10px] text-muted-foreground/70 truncate">
                  {dotEnvTargetFolder
                    ? `Folder: ${dotEnvTargetFolder}`
                    : "No folder selected for .env updates"}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => void handleQuickEnvApply()}
                disabled={applyingQuickEnv || !quickEnvInput.trim()}
                className="h-7 px-2 rounded text-xs font-medium bg-primary/20 hover:bg-primary/30 text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {applyingQuickEnv ? "Saving..." : "Apply"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Scrollable sections ── */}
      <div className="flex-1 overflow-y-auto">
        {/* ── B. Terminal Appearance ── */}
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
                  <label
                    htmlFor="setting-color-theme"
                    className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70 mb-1 block"
                  >
                    Color Theme
                  </label>
                  <select
                    id="setting-color-theme"
                    value={currentTheme}
                    onChange={(e) => updateAppearance({ theme: e.target.value })}
                    className="w-full h-7 text-xs px-1.5 bg-card border border-border rounded text-foreground"
                  >
                    {Object.entries(TERMINAL_THEMES).map(([key, { label }]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
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
                  <div className="mb-1 flex items-center gap-1.5">
                    <label
                      id="setting-bell-style-label"
                      className="text-[10px] uppercase tracking-widest font-medium text-muted-foreground/70"
                    >
                      Bell Style
                    </label>
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center text-muted-foreground/70 hover:text-foreground transition-colors"
                            aria-label="Bell style help"
                          >
                            <Info size={11} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                          <p>
                            Controls how terminal bell events are surfaced.
                          </p>
                          <p>
                            Visual: brief flash cue. Badge: activity indicator cue.
                            None: ignore bell events.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
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

          </Section>
        )}

      </div>
    </div>
  );
}
