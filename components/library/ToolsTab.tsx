"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Wrench,
  Search,
  Server,
  Puzzle,
  Sparkles,
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddMCPDialog } from "./AddMCPDialog";
import { SkillEditor } from "./SkillEditor";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CustomSkill } from "@/lib/skills-shared";

interface ToolInfo {
  name: string;
  type: "mcp" | "builtin" | "plugin" | "skill";
  server?: string;
  description?: string;
  version?: string;
  enabled?: boolean;
  plugin?: string;
  pluginId?: string;
  registry?: string;
  url?: string;
  command?: string;
  installPath?: string;
}

export function ToolsTab() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddMCP, setShowAddMCP] = useState(false);
  const [deletingMcp, setDeletingMcp] = useState<string | null>(null);
  const [customSkills, setCustomSkills] = useState<CustomSkill[]>([]);
  const [showSkillEditor, setShowSkillEditor] = useState(false);
  const [editingSkill, setEditingSkill] = useState<string | null>(null);

  const refreshTools = useCallback(() => {
    setLoading(true);
    fetch("/api/tools")
      .then((r) => r.json())
      .then((data: ToolInfo[]) => {
        if (Array.isArray(data)) setTools(data);
      })
      .catch((err) => console.debug('[TOOLS]', err.message))
      .finally(() => setLoading(false));
  }, []);

  const refreshSkills = useCallback(() => {
    fetch("/api/skills")
      .then((r) => r.json())
      .then((data: CustomSkill[]) => {
        if (Array.isArray(data)) setCustomSkills(data);
      })
      .catch((err) => console.debug('[TOOLS]', err.message));
  }, []);

  useEffect(() => {
    refreshTools();
    refreshSkills();
  }, [refreshTools, refreshSkills]);

  const handleDeleteMCP = async (name: string) => {
    setDeletingMcp(name);
    try {
      const res = await fetch(`/api/tools/mcp?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to remove MCP server");
      }
      refreshTools();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove MCP server",
      );
    }
    setDeletingMcp(null);
  };

  const handleTogglePlugin = async (tool: ToolInfo) => {
    const pluginId = tool.pluginId;
    if (!pluginId) return;
    const newEnabled = !tool.enabled;
    // Optimistic update
    setTools((prev) =>
      prev.map((t) => (t === tool ? { ...t, enabled: newEnabled } : t)),
    );
    try {
      await fetch("/api/tools/plugins", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pluginId,
          enabled: newEnabled,
          installPath: tool.installPath,
        }),
      });
    } catch {
      // Revert on failure
      setTools((prev) =>
        prev.map((t) =>
          t.name === tool.name && t.type === "plugin"
            ? { ...t, enabled: !newEnabled }
            : t,
        ),
      );
    }
  };

  const handleDeleteSkill = async (name: string) => {
    try {
      await fetch(`/api/skills/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      refreshSkills();
    } catch {
      toast.error("Failed to delete skill");
    }
  };

  const handleToggleSkill = async (skill: CustomSkill) => {
    try {
      await fetch(`/api/skills/${encodeURIComponent(skill.name)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disabled: !skill.disabled,
          projectPath: skill.visibility === "project" ? skill.projectPath : undefined,
        }),
      });
      refreshSkills();
    } catch {
      toast.error(`Failed to ${skill.disabled ? "enable" : "disable"} skill`);
    }
  };

  const filtered = tools.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase()) ||
      t.server?.toLowerCase().includes(search.toLowerCase()) ||
      t.plugin?.toLowerCase().includes(search.toLowerCase()),
  );

  const grouped = {
    builtin: filtered.filter((t) => t.type === "builtin"),
    mcp: filtered.filter((t) => t.type === "mcp"),
    plugin: filtered.filter((t) => t.type === "plugin"),
    skill: filtered.filter((t) => t.type === "skill"),
  };

  return (
    <TooltipProvider delayDuration={220}>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Available Tools</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Builtin tools, MCP servers, plugins, and skills from your Claude
            setup
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-meta text-muted-foreground">
            <Badge variant="secondary" className="text-micro">
              {grouped.builtin.length} builtin
            </Badge>
            <Badge variant="outline" className="text-micro">
              {grouped.mcp.length} MCP
            </Badge>
            <Badge
              variant="outline"
              className="text-micro border-chart-4/30 text-chart-4"
            >
              {grouped.plugin.length} plugins
            </Badge>
            <Badge
              variant="outline"
              className="text-micro border-chart-5/30 text-chart-5"
            >
              {grouped.skill.length} skills
            </Badge>
          </div>
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tools..."
              className="w-[200px] h-7 text-xs pl-8"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground py-8 text-center">
          Loading tools...
        </div>
      ) : (
        <>
          {grouped.builtin.length > 0 && (
            <div>
              <div className="text-section-label mb-2">Builtin Tools</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {grouped.builtin.map((tool) => (
                  <Card key={tool.name} className="bg-card">
                    <CardContent className="p-3 flex items-center gap-3">
                      <Wrench size={14} className="text-chart-2 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-mono font-medium">
                          {tool.name}
                        </span>
                        {tool.description && (
                          <p className="text-meta text-muted-foreground/60 truncate">
                            {tool.description}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-micro shrink-0 ml-auto"
                      >
                        builtin
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* MCP Servers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-section-label">MCP Servers</div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setShowAddMCP(true)}
              >
                <Plus size={11} />
                Add Server
              </Button>
            </div>
            {grouped.mcp.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {grouped.mcp.map((tool) => (
                  <Card key={tool.name} className="bg-card">
                    <CardContent className="p-3 flex items-center gap-3">
                      <Server size={14} className="text-chart-1 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-mono font-medium">
                          {tool.name}
                        </span>
                        {tool.url ? (
                          <p className="text-meta text-muted-foreground/60 truncate">
                            {tool.url}
                          </p>
                        ) : tool.command ? (
                          <p className="text-meta text-muted-foreground/60 truncate font-mono">
                            {tool.description}
                          </p>
                        ) : (
                          tool.description && (
                            <p className="text-meta text-muted-foreground/60 truncate">
                              {tool.description}
                            </p>
                          )
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                        <Badge variant="outline" className="text-micro">
                          {tool.url ? "http" : "stdio"}
                        </Badge>
                        <button
                          onClick={() => handleDeleteMCP(tool.name)}
                          disabled={deletingMcp === tool.name}
                          className="p-1 hover:bg-destructive/20 rounded transition-colors"
                        >
                          <Trash2 size={11} className="text-muted-foreground" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-xs text-text-tertiary py-2">
                No MCP servers configured
              </div>
            )}
          </div>

          {grouped.plugin.length > 0 && (
            <div>
              <div className="text-section-label mb-2">Plugins</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {grouped.plugin.map((tool) => (
                  <Card key={tool.name} className="bg-card">
                    <CardContent className="p-3 flex items-center gap-3">
                      <Puzzle size={14} className="text-chart-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono font-medium">
                            {tool.name}
                          </span>
                          {tool.version && (
                            <span className="text-meta text-text-tertiary">
                              v{tool.version}
                            </span>
                          )}
                          {tool.url && (
                            <a
                              href={tool.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground/60 hover:text-foreground transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                        {tool.description && (
                          <p className="text-meta text-muted-foreground/60 truncate">
                            {tool.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleTogglePlugin(tool)}
                        className={cn(
                          "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors ml-auto",
                          tool.enabled
                            ? "bg-emerald-500"
                            : "bg-muted-foreground/30",
                        )}
                        role="switch"
                        aria-checked={tool.enabled}
                        title={
                          tool.enabled ? "Disable plugin" : "Enable plugin"
                        }
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-3 w-3 rounded-full bg-primary-foreground shadow-sm transform transition-transform mt-0.5",
                            tool.enabled
                              ? "translate-x-[13px]"
                              : "translate-x-0.5",
                          )}
                        />
                      </button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Skills (plugin-provided) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-section-label">Skills</div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  setEditingSkill(null);
                  setShowSkillEditor(true);
                }}
              >
                <Plus size={11} />
                New Skill
              </Button>
            </div>
            {grouped.skill.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {grouped.skill.map((tool) => (
                  <Card key={`${tool.plugin}-${tool.name}`} className="bg-card">
                    <CardContent className="p-3 flex items-start gap-3">
                      <Sparkles
                        size={14}
                        className="text-chart-5 shrink-0 mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono font-medium">
                            {tool.name}
                          </span>
                        </div>
                        {tool.description && (
                          <p className="text-meta text-muted-foreground/60 line-clamp-2 mt-0.5">
                            {tool.description}
                          </p>
                        )}
                        {tool.plugin && (
                          <p className="text-micro text-text-tertiary mt-1">
                            from{" "}
                            <span className="font-mono">{tool.plugin}</span>
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className="text-micro shrink-0 border-chart-5/30 text-chart-5"
                      >
                        skill
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : customSkills.length === 0 ? (
              <div className="text-xs text-text-tertiary py-2">
                No skills found.{" "}
                <button
                  onClick={() => {
                    setEditingSkill(null);
                    setShowSkillEditor(true);
                  }}
                  className="text-chart-5 hover:underline"
                >
                  Create a custom skill
                </button>
              </div>
            ) : null}
          </div>

          {/* Custom Skills */}
          {customSkills.length > 0 && (
            <div>
              <div className="text-section-label mb-2">Custom Skills</div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {customSkills.map((skill) => (
                  <Card
                    key={skill.name}
                    className={cn("bg-card card-hover-glow", skill.disabled && "opacity-55")}
                  >
                    <CardContent className="p-3 flex items-start gap-3">
                      <Sparkles
                        size={14}
                        className="text-chart-5 shrink-0 mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "text-xs font-mono font-medium",
                            skill.disabled && "line-through decoration-text-quaternary",
                          )}
                        >
                          {skill.name}
                        </span>
                        {skill.description && (
                          <p className="text-meta text-muted-foreground/60 line-clamp-2 mt-0.5">
                            {skill.description}
                          </p>
                        )}
                        <p className="text-micro text-text-tertiary mt-1 flex items-center gap-1.5">
                          /{skill.name}
                          {skill.disabled && <span className="italic">disabled</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleToggleSkill(skill)}
                              className="p-1 hover:bg-chart-5/10 rounded transition-colors"
                              title={skill.disabled ? "Enable skill" : "Disable skill"}
                            >
                              {skill.disabled ? (
                                <Eye size={11} className="text-muted-foreground" />
                              ) : (
                                <EyeOff size={11} className="text-muted-foreground" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            {skill.disabled ? "Enable skill" : "Disable skill"}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => {
                                setEditingSkill(skill.name);
                                setShowSkillEditor(true);
                              }}
                              className="p-1 hover:bg-chart-5/10 rounded transition-colors"
                              title="Edit skill"
                            >
                              <Pencil size={11} className="text-muted-foreground" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">Edit skill</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleDeleteSkill(skill.name)}
                              className="p-1 hover:bg-destructive/20 rounded transition-colors"
                              title="Delete skill"
                            >
                              <Trash2 size={11} className="text-muted-foreground" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">Delete skill</TooltipContent>
                        </Tooltip>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">
              No tools match your search.
            </div>
          )}
        </>
      )}

      <AddMCPDialog
        open={showAddMCP}
        onClose={() => setShowAddMCP(false)}
        onSuccess={refreshTools}
      />

      <SkillEditor
        open={showSkillEditor}
        skillName={editingSkill}
        onClose={() => {
          setShowSkillEditor(false);
          setEditingSkill(null);
        }}
        onSuccess={refreshSkills}
      />
    </div>
    </TooltipProvider>
  );
}
