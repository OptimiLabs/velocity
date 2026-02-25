"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  ChevronDown,
  ChevronRight,
  Globe,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClaudeSettings } from "@/lib/claude-settings";

// --- Rule format helpers ---
// Claude Code stores rules as strings: "Bash(npm run *)" or "WebSearch"
// Legacy UI wrote objects: { tool: "Bash", pattern: "npm run *" }

interface ParsedRule {
  tool: string;
  pattern?: string;
}

function parseRule(raw: string | Record<string, unknown>): ParsedRule {
  if (typeof raw === "string") {
    const match = raw.match(/^([^(]+)\((.+)\)$/);
    if (match) return { tool: match[1], pattern: match[2] };
    return { tool: raw };
  }
  // Legacy object format
  const obj = raw as { tool?: string; pattern?: string };
  return { tool: obj.tool || "Unknown", pattern: obj.pattern };
}

function formatRule(tool: string, pattern?: string): string {
  if (pattern && pattern.trim()) return `${tool}(${pattern.trim()})`;
  return tool;
}

// --- Types ---

interface PermissionsConfig {
  allow?: (string | Record<string, unknown>)[];
  ask?: (string | Record<string, unknown>)[];
  deny?: (string | Record<string, unknown>)[];
  defaultMode?: string;
}

const TOOLS = [
  "Bash",
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Task",
  "Skill",
  "NotebookEdit",
  "mcp__*",
];

const MODES = [
  { value: "default", label: "Default", desc: "Ask for non-read operations" },
  {
    value: "plan",
    label: "Plan Mode",
    desc: "Read-only, plan before executing",
  },
  {
    value: "acceptEdits",
    label: "Accept Edits",
    desc: "Auto-approve file edits",
  },
  { value: "dontAsk", label: "Don't Ask", desc: "Approve all tool calls" },
];

const SECTION_META: {
  key: "deny" | "ask" | "allow";
  label: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    key: "deny",
    label: "Deny",
    icon: <ShieldX size={14} />,
    color: "text-red-500 dark:text-red-400",
  },
  {
    key: "ask",
    label: "Ask",
    icon: <ShieldAlert size={14} />,
    color: "text-yellow-500 dark:text-yellow-400",
  },
  {
    key: "allow",
    label: "Allow",
    icon: <ShieldCheck size={14} />,
    color: "text-green-500 dark:text-green-400",
  },
];

interface PermissionsTabProps {
  settings: ClaudeSettings;
  onUpdate: (partial: Partial<ClaudeSettings>) => Promise<void>;
}

export function PermissionsTab({ settings, onUpdate }: PermissionsTabProps) {
  const [addSection, setAddSection] = useState<{
    scope: "global" | "project";
    key: "allow" | "ask" | "deny";
  } | null>(null);
  const [newTool, setNewTool] = useState("Bash");
  const [newPattern, setNewPattern] = useState("");

  // Dual-scope state
  const [projectSettings, setProjectSettings] = useState<ClaudeSettings | null>(
    null,
  );
  const [projectCwd, setProjectCwd] = useState<string | null>(null);
  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(
    new Set(["global", "project"]),
  );

  // Load project cwd from first recent project
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((raw) => {
        const data: { id: string; name: string; path: string }[] =
          raw.projects ?? raw;
        if (Array.isArray(data) && data.length > 0) {
          setProjectCwd(data[0].path);
        }
      })
      .catch((err) => console.warn('[SETTINGS]', err.message));
  }, []);

  // Load project settings when cwd is known
  const loadProjectSettings = useCallback(() => {
    if (!projectCwd) return;
    fetch(`/api/settings?scope=project&cwd=${encodeURIComponent(projectCwd)}`)
      .then((r) => r.json())
      .then((data) => setProjectSettings(data))
      .catch((err) => console.warn('[SETTINGS]', err.message));
  }, [projectCwd]);

  useEffect(() => {
    loadProjectSettings();
  }, [loadProjectSettings]);

  const globalPerms = (settings.permissions || {}) as PermissionsConfig;
  const projectPerms = (projectSettings?.permissions ||
    {}) as PermissionsConfig;

  const toggleScope = (scope: string) => {
    setExpandedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  };

  // --- Mutations ---

  const updateGlobalPerms = async (perms: PermissionsConfig) => {
    await onUpdate({ permissions: perms as Record<string, unknown> });
  };

  const updateProjectPerms = async (perms: PermissionsConfig) => {
    if (!projectCwd) return;
    await fetch(
      `/api/settings?scope=project&cwd=${encodeURIComponent(projectCwd)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: perms }),
      },
    );
    loadProjectSettings();
  };

  const addRule = async () => {
    if (!addSection) return;
    const ruleStr = formatRule(newTool, newPattern);
    const { scope, key } = addSection;
    const perms = scope === "global" ? globalPerms : projectPerms;
    const current = [...(perms[key] || [])];
    current.push(ruleStr);
    const updated = { ...perms, [key]: current };
    if (scope === "global") await updateGlobalPerms(updated);
    else await updateProjectPerms(updated);
    setAddSection(null);
    setNewTool("Bash");
    setNewPattern("");
  };

  const removeRule = async (
    scope: "global" | "project",
    section: "allow" | "ask" | "deny",
    index: number,
  ) => {
    const perms = scope === "global" ? globalPerms : projectPerms;
    const current = [...(perms[section] || [])];
    current.splice(index, 1);
    const updated = { ...perms, [section]: current };
    if (scope === "global") await updateGlobalPerms(updated);
    else await updateProjectPerms(updated);
  };

  const clearSection = async (
    scope: "global" | "project",
    section: "allow" | "ask" | "deny",
  ) => {
    const perms = scope === "global" ? globalPerms : projectPerms;
    const updated = { ...perms, [section]: [] };
    if (scope === "global") await updateGlobalPerms(updated);
    else await updateProjectPerms(updated);
  };

  const setDefaultMode = async (mode: string) => {
    await onUpdate({
      permissions: {
        ...globalPerms,
        defaultMode: mode === "default" ? undefined : mode,
      },
    });
  };

  // --- Render helpers ---

  const renderRules = (
    scope: "global" | "project",
    perms: PermissionsConfig,
  ) => {
    return SECTION_META.map(({ key, label, icon, color }) => {
      const rawRules = perms[key] || [];
      const rules = rawRules.map(parseRule);
      return (
        <div key={key} className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={color}>{icon}</span>
            <span className="text-xs font-medium">{label}</span>
            <span className="text-meta text-muted-foreground">
              ({rules.length})
            </span>
            <div className="flex-1" />
            {rules.length > 0 && (
              <button
                onClick={() => clearSection(scope, key)}
                className="text-meta text-muted-foreground hover:text-destructive transition-colors"
                title={`Clear all ${label} rules`}
              >
                <Trash2 size={10} />
              </button>
            )}
            <button
              onClick={() => setAddSection({ scope, key })}
              className="text-meta text-muted-foreground hover:text-primary transition-colors"
              title={`Add ${label} rule`}
            >
              <Plus size={10} />
            </button>
          </div>

          {rules.length > 0 && (
            <div className="space-y-0.5 ml-5">
              {rules.map((rule, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs font-mono bg-muted/50 rounded px-2 py-1"
                >
                  <Badge variant="outline" className="text-meta">
                    {rule.tool}
                  </Badge>
                  {rule.pattern && (
                    <span className="text-muted-foreground truncate">
                      ({rule.pattern})
                    </span>
                  )}
                  <div className="flex-1" />
                  <button
                    onClick={() => removeRule(scope, key, i)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* Eval order note */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
        <Shield size={14} className="mt-0.5 shrink-0" />
        <div>
          <strong>Evaluation order:</strong> Deny &rarr; Ask &rarr; Allow (first
          match wins). Project rules are evaluated before global rules.
        </div>
      </div>

      {/* Default Mode */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Default Permission Mode</h3>
        <div className="w-64">
          <Select
            value={globalPerms.defaultMode || "default"}
            onValueChange={setDefaultMode}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  <span className="font-medium">{m.label}</span>
                  <span className="text-muted-foreground ml-2">{m.desc}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Global scope */}
      <section className="space-y-2">
        <button
          onClick={() => toggleScope("global")}
          className="flex items-center gap-2 w-full text-left"
        >
          {expandedScopes.has("global") ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
          <Globe size={14} className="text-muted-foreground" />
          <h3 className="text-sm font-medium">Global</h3>
          <span className="text-meta text-muted-foreground">
            ~/.claude/settings.json
          </span>
        </button>
        {expandedScopes.has("global") && (
          <div className="ml-5 space-y-3 border-l border-border pl-3">
            {renderRules("global", globalPerms)}
          </div>
        )}
      </section>

      {/* Project scope */}
      {projectCwd && (
        <section className="space-y-2">
          <button
            onClick={() => toggleScope("project")}
            className="flex items-center gap-2 w-full text-left"
          >
            {expandedScopes.has("project") ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
            <FolderOpen size={14} className="text-muted-foreground" />
            <h3 className="text-sm font-medium">Project</h3>
            <span className="text-meta text-muted-foreground truncate max-w-xs">
              .claude/settings.local.json
            </span>
          </button>
          {expandedScopes.has("project") && (
            <div className="ml-5 space-y-3 border-l border-border pl-3">
              {projectSettings === null ? (
                <p className="text-xs text-muted-foreground">Loading...</p>
              ) : (
                renderRules("project", projectPerms)
              )}
            </div>
          )}
        </section>
      )}

      {/* Add Rule Dialog */}
      {addSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-popover border border-border rounded-xl shadow-xl w-full max-w-sm mx-4 p-4 space-y-4">
            <h3 className="text-sm font-medium">
              Add{" "}
              {addSection.key.charAt(0).toUpperCase() + addSection.key.slice(1)}{" "}
              Rule
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                ({addSection.scope})
              </span>
            </h3>

            <div className="space-y-1">
              <label className="text-xs font-medium">Tool</label>
              <Select value={newTool} onValueChange={setNewTool}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOOLS.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs font-mono">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">
                Pattern{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <input
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                placeholder="e.g. npm run *, ./src/**/*.ts"
                className="w-full h-8 text-xs font-mono rounded border border-border bg-background px-2"
              />
            </div>

            <div className="text-xs font-mono bg-muted/50 rounded p-2">
              Preview:{" "}
              <span className="text-primary">
                {formatRule(newTool, newPattern || undefined)}
              </span>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setAddSection(null)}
              >
                Cancel
              </Button>
              <Button size="sm" className="h-8" onClick={addRule}>
                Add Rule
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
