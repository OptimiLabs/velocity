"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  Search,
  Settings,
  Plus,
  Zap,
  Bug,
  Terminal,
  Bot,
} from "lucide-react";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { findNode } from "@/lib/console/pane-tree";
import type { ConsoleSession } from "@/types/console";

interface EnvPanelProps {
  wsRef: React.RefObject<WebSocket | null>;
  activeTerminalId?: string | null;
  activeSession?: ConsoleSession | null;
  onUpdateSessionEnv?: (id: string, env: Record<string, string>) => void;
}

const ENV_PRESETS: {
  label: string;
  icon: typeof Zap;
  env: Record<string, string>;
}[] = [
  { label: "Node Debug", icon: Bug, env: { NODE_OPTIONS: "--inspect" } },
  { label: "Verbose", icon: Terminal, env: { DEBUG: "*" } },
];

const CLAUDE_PRESETS: {
  label: string;
  env: Record<string, string>;
  description: string;
}[] = [
  {
    label: "Low Effort",
    env: { CLAUDE_CODE_EFFORT_LEVEL: "low" },
    description: "Faster, shorter responses",
  },
  {
    label: "High Effort",
    env: { CLAUDE_CODE_EFFORT_LEVEL: "high" },
    description: "More thorough responses",
  },
  {
    label: "Agent Teams",
    env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1" },
    description: "Enable experimental agent teams",
  },
];

export function EnvPanel({
  wsRef,
  activeTerminalId,
  activeSession,
  onUpdateSessionEnv,
}: EnvPanelProps) {
  const [env, setEnv] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [masked, setMasked] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [claudeNewKey, setClaudeNewKey] = useState("");
  const [claudeNewValue, setClaudeNewValue] = useState("");
  const [showClaudeAdd, setShowClaudeAdd] = useState(false);

  const terminals = useConsoleLayoutStore((s) => s.terminals);
  const updateTerminalMeta = useConsoleLayoutStore((s) => s.updateTerminalMeta);
  const activePaneId = useConsoleLayoutStore((s) => s.activePaneId);
  const paneTree = useConsoleLayoutStore((s) => s.paneTree);

  // Derive active terminal ID from activePaneId
  const activeLeaf = activePaneId ? findNode(paneTree, activePaneId) : null;
  const derivedTermId =
    activeLeaf?.kind === "leaf" && activeLeaf.content.type === "terminal"
      ? activeLeaf.content.terminalId
      : null;
  const targetTerminalId = activeTerminalId ?? derivedTermId;
  const targetMeta = targetTerminalId ? terminals[targetTerminalId] : null;

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

  const filteredEntries = useMemo(() => {
    const entries = Object.entries(env).sort(([a], [b]) => a.localeCompare(b));
    if (!filter) return entries;
    const lower = filter.toLowerCase();
    return entries.filter(
      ([k, v]) =>
        k.toLowerCase().includes(lower) || v.toLowerCase().includes(lower),
    );
  }, [env, filter]);

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

  const handleAddOverride = () => {
    if (!targetTerminalId || !newKey.trim()) return;
    updateTerminalMeta(targetTerminalId, {
      envOverrides: { ...targetMeta?.envOverrides, [newKey.trim()]: newValue },
    });
    setNewKey("");
    setNewValue("");
    setShowAdd(false);
  };

  const handleApplyPreset = (preset: Record<string, string>) => {
    if (!targetTerminalId) return;
    updateTerminalMeta(targetTerminalId, {
      envOverrides: { ...targetMeta?.envOverrides, ...preset },
    });
  };

  // Claude session env handlers
  const handleAddClaudeEnv = () => {
    if (!activeSession || !onUpdateSessionEnv || !claudeNewKey.trim()) return;
    onUpdateSessionEnv(activeSession.id, {
      [claudeNewKey.trim()]: claudeNewValue,
    });
    setClaudeNewKey("");
    setClaudeNewValue("");
    setShowClaudeAdd(false);
  };

  const handleApplyClaudePreset = (preset: Record<string, string>) => {
    if (!activeSession || !onUpdateSessionEnv) return;
    onUpdateSessionEnv(activeSession.id, preset);
  };

  const sessionEnvEntries = activeSession?.env
    ? Object.entries(activeSession.env)
    : [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/50">
        <Settings className="w-3 h-3 text-muted-foreground" />
        <span className="text-meta font-medium text-muted-foreground">
          Environment
        </span>
        <span className="text-meta text-muted-foreground/60 ml-auto">
          {filteredEntries.length} / {Object.keys(env).length} vars
        </span>
      </div>

      {/* Claude session overrides */}
      {activeSession && onUpdateSessionEnv && (
        <div className="px-2.5 py-1.5 border-b border-border/50 bg-primary/5">
          <div className="flex items-center gap-1.5 mb-1">
            <Bot className="w-2.5 h-2.5 text-primary/70" />
            <span className="text-meta font-medium text-primary/80">
              Claude: {activeSession.label}
            </span>
            <span className="text-meta text-muted-foreground/50 ml-auto">
              next resume
            </span>
          </div>

          {/* Current Claude env overrides */}
          {sessionEnvEntries.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {sessionEnvEntries.map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-meta font-mono"
                >
                  <span className="text-primary/80">{k}</span>
                  <span className="text-muted-foreground">=</span>
                  <span className="text-foreground/70">{v}</span>
                </span>
              ))}
            </div>
          )}

          {/* Claude presets */}
          <div className="flex items-center gap-1 flex-wrap">
            {CLAUDE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handleApplyClaudePreset(preset.env)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-meta bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                title={preset.description}
              >
                <Zap className="w-2.5 h-2.5" />
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => setShowClaudeAdd(!showClaudeAdd)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-meta bg-muted/30 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="w-2.5 h-2.5" />
              Custom
            </button>
          </div>

          {/* Add Claude env form */}
          {showClaudeAdd && (
            <div className="flex items-center gap-1 mt-1.5">
              <input
                type="text"
                placeholder="KEY"
                value={claudeNewKey}
                onChange={(e) => setClaudeNewKey(e.target.value)}
                className="flex-1 bg-muted/30 rounded px-1.5 py-0.5 text-xs font-mono outline-none placeholder:text-muted-foreground"
              />
              <span className="text-muted-foreground text-xs">=</span>
              <input
                type="text"
                placeholder="value"
                value={claudeNewValue}
                onChange={(e) => setClaudeNewValue(e.target.value)}
                className="flex-1 bg-muted/30 rounded px-1.5 py-0.5 text-xs font-mono outline-none placeholder:text-muted-foreground"
                onKeyDown={(e) => e.key === "Enter" && handleAddClaudeEnv()}
              />
              <button
                onClick={handleAddClaudeEnv}
                className="px-2 py-0.5 rounded text-xs bg-primary/20 hover:bg-primary/30 text-primary transition-colors"
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}

      {/* Per-terminal overrides section */}
      {targetMeta && (
        <div className="px-2.5 py-1.5 border-b border-border/50 bg-muted/10">
          <div className="flex items-center gap-1.5 mb-1">
            <Terminal className="w-2.5 h-2.5 text-primary/70" />
            <span className="text-meta font-medium text-primary/80">
              Terminal: {targetMeta.label}
            </span>
            <span className="text-meta text-muted-foreground/50 ml-auto">
              new terminals only
            </span>
          </div>

          {/* Current overrides */}
          {targetMeta.envOverrides &&
            Object.keys(targetMeta.envOverrides).length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {Object.entries(targetMeta.envOverrides).map(([k, v]) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-meta font-mono"
                  >
                    <span className="text-primary/80">{k}</span>
                    <span className="text-muted-foreground">=</span>
                    <span className="text-foreground/70">{v}</span>
                  </span>
                ))}
              </div>
            )}

          {/* Presets + Add */}
          <div className="flex items-center gap-1">
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
            <div className="flex items-center gap-1 mt-1.5">
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
        </div>
      )}

      {/* Search + mask toggle */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/50">
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
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="table-readable w-full">
          <tbody>
            {filteredEntries.map(([key, value], i) => (
              <tr
                key={key}
                className={`group ${i % 2 === 0 ? "bg-transparent" : "bg-muted/10"} hover:bg-muted/20`}
              >
                <td className="px-2.5 py-1 font-mono text-meta font-medium text-foreground/80 whitespace-nowrap">
                  {key}
                </td>
                <td className="px-2.5 py-1 font-mono text-meta text-muted-foreground truncate max-w-[300px]">
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
                  className="px-3 py-8 text-center text-muted-foreground/50 text-detail"
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
    </div>
  );
}
