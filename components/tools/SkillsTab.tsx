"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sparkles,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  RotateCcw,
  EyeOff,
  Eye,
  Archive,
  Merge,
  Package,
  X,
  GitBranch,
  FolderOpen,
} from "lucide-react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui/status-pill";
import { SkillEditor } from "@/components/library/SkillEditor";
import { NewSkillDialog } from "@/components/library/NewSkillDialog";
import { SkillMergeSheet } from "./SkillMergeSheet";
import { DisabledStorageNote } from "@/components/ui/disabled-storage-note";
import type { ConfigProvider } from "@/types/provider";
import type { ToolInfo } from "@/hooks/useTools";
import type { CustomSkill } from "@/lib/skills-shared";

interface SkillItem extends Omit<CustomSkill, "content"> {
  content?: string;
  source: "global" | "project" | string;
  plugin?: string;
  filePath?: string;
}

type SortField = "name" | "scope" | "source";
type SortDir = "asc" | "desc";

import type { ScopeFilter } from "@/types/scope";

interface SkillsTabProps {
  pluginSkills: ToolInfo[];
  provider: ConfigProvider;
  search: string;
  scopeFilter: ScopeFilter;
  onRefresh: () => void;
  showNewSkillForm: boolean;
  onCloseNewSkill: () => void;
}

const PAGE_SIZE = 25;

export function SkillsTab({
  pluginSkills,
  provider,
  search,
  scopeFilter,
  onRefresh,
  showNewSkillForm,
  onCloseNewSkill,
}: SkillsTabProps) {
  const isClaude = provider === "claude";

  const [customSkills, setCustomSkills] = useState<CustomSkill[]>([]);
  const [archivedSkills, setArchivedSkills] = useState<CustomSkill[]>([]);
  const [editingSkill, setEditingSkill] = useState<{
    name: string;
    visibility: "global" | "project";
    projectPath?: string;
    projectName?: string;
    provider?: ConfigProvider;
  } | null>(null);
  const [showMergeSheet, setShowMergeSheet] = useState(false);
  const [mergeSkills, setMergeSkills] = useState<
    {
      name: string;
      origin: "user" | "plugin";
      projectPath?: string;
      content?: string;
    }[]
  >([]);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState(false);

  // Bundle dialog state
  const [showBundleDialog, setShowBundleDialog] = useState(false);
  const [bundlePluginName, setBundlePluginName] = useState("");
  const [bundleDescription, setBundleDescription] = useState("");
  const [bundleError, setBundleError] = useState("");
  const [bundleResult, setBundleResult] = useState<{
    path: string;
    structure: string[];
  } | null>(null);

  const refreshCustomSkills = useCallback(() => {
    fetch(`/api/skills?provider=${provider}`)
      .then((r) => r.json())
      .then((data: CustomSkill[]) => {
        if (Array.isArray(data)) setCustomSkills(data);
      })
      .catch((err) => console.debug('[TOOLS]', err.message));
  }, [provider]);

  const refreshArchivedSkills = useCallback(() => {
    if (provider !== "claude") {
      setArchivedSkills([]);
      return;
    }
    fetch("/api/skills/archive")
      .then((r) => r.json())
      .then((data: CustomSkill[]) => {
        if (Array.isArray(data)) setArchivedSkills(data);
      })
      .catch((err) => console.debug('[TOOLS]', err.message));
  }, [provider]);

  useEffect(() => {
    refreshCustomSkills();
    refreshArchivedSkills();
  }, [refreshCustomSkills, refreshArchivedSkills]);

  const refreshAll = useCallback(() => {
    refreshCustomSkills();
    refreshArchivedSkills();
    onRefresh();
    window.dispatchEvent(new CustomEvent("mcp:restart-sessions"));
  }, [refreshCustomSkills, refreshArchivedSkills, onRefresh]);

  const handleRestoreSkill = async (skill: SkillItem) => {
    try {
      const res = await fetch(
        `/api/skills/archive/${encodeURIComponent(skill.name)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectPath: skill.projectPath,
          }),
        },
      );
      if (res.ok) {
        toast.success(`Restored "${skill.name}"`);
        refreshAll();
      }
    } catch {
      toast.error("Failed to restore skill");
    }
  };

  const handleDeleteArchivedSkill = async (skill: SkillItem) => {
    try {
      const params = new URLSearchParams();
      if (skill.projectPath) params.set("projectPath", skill.projectPath);
      const qs = params.toString() ? `?${params}` : "";
      const res = await fetch(
        `/api/skills/archive/${encodeURIComponent(skill.name)}${qs}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        toast.success(`Permanently deleted "${skill.name}"`);
        refreshArchivedSkills();
      }
    } catch {
      toast.error("Failed to delete archived skill");
    }
  };

  const handleDeleteSkill = async (skill: SkillItem) => {
    try {
      const params = new URLSearchParams();
      params.set("provider", provider);
      if (skill.visibility === "project" && skill.projectPath) {
        params.set("projectPath", skill.projectPath);
      }
      await fetch(
        `/api/skills/${encodeURIComponent(skill.name)}?${params.toString()}`,
        {
        method: "DELETE",
        },
      );
      refreshAll();
    } catch {
      toast.error("Failed to delete skill");
    }
  };

  // --- Bulk action handlers (ported from SkillManagerModal) ---

  const handleToggleDisabled = async (disabled: boolean) => {
    setActing(true);
    let success = 0;
    for (const s of customSelected) {
      try {
        const params = new URLSearchParams();
        params.set("provider", provider);
        const res = await fetch(
          `/api/skills/${encodeURIComponent(s.name)}?${params.toString()}`,
          {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            disabled,
            projectPath: s.visibility === "project" ? s.projectPath : undefined,
          }),
          },
        );
        if (res.ok) success++;
      } catch {
        /* skip */
      }
    }
    setActing(false);
    if (success > 0) {
      toast.success(
        `${disabled ? "Disabled" : "Enabled"} ${success} skill${success !== 1 ? "s" : ""}`,
      );
      refreshAll();
      setSelected(new Set());
    }
  };

  const handleToggleSingleSkill = async (
    skill: SkillItem,
    disabled: boolean,
  ) => {
    try {
      const params = new URLSearchParams();
      params.set("provider", provider);
      const res = await fetch(
        `/api/skills/${encodeURIComponent(skill.name)}?${params.toString()}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            disabled,
            projectPath: skill.visibility === "project" ? skill.projectPath : undefined,
          }),
        },
      );
      if (!res.ok) throw new Error("Failed to update skill");
      toast.success(`${disabled ? "Disabled" : "Enabled"} "${skill.name}"`);
      refreshAll();
    } catch {
      toast.error(`Failed to ${disabled ? "disable" : "enable"} skill`);
    }
  };

  const handleBulkArchive = async () => {
    setActing(true);
    try {
      const res = await fetch("/api/skills/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: actionableSelected.map((s) => ({
            name: s.name,
            projectPath: s.visibility === "project" ? s.projectPath : undefined,
            filePath: s.origin === "plugin" ? s.filePath : undefined,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(
          `Archived ${data.archived} skill${data.archived !== 1 ? "s" : ""}`,
        );
        refreshAll();
        setSelected(new Set());
      }
    } catch {
      toast.error("Failed to archive skills");
    }
    setActing(false);
  };

  const handleBulkDelete = async () => {
    setActing(true);
    let success = 0;
    for (const s of customSelected) {
      try {
        const params = new URLSearchParams();
        params.set("provider", provider);
        if (s.visibility === "project" && s.projectPath) {
          params.set("projectPath", s.projectPath);
        }
        const res = await fetch(
          `/api/skills/${encodeURIComponent(s.name)}?${params.toString()}`,
          { method: "DELETE" },
        );
        if (res.ok) success++;
      } catch {
        /* skip */
      }
    }
    setActing(false);
    if (success > 0) {
      toast.success(`Deleted ${success} skill${success !== 1 ? "s" : ""}`);
      refreshAll();
      setSelected(new Set());
    }
  };

  const handleOpenMerge = () => {
    setMergeSkills(
      selectedSkills.map((s) => ({
        name: s.name,
        origin: s.origin,
        projectPath: s.projectPath,
        content: s.content,
      })),
    );
    setShowMergeSheet(true);
  };

  const handleExport = async () => {
    setBundleError("");
    setActing(true);
    try {
      const res = await fetch("/api/tools/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pluginName: bundlePluginName.trim(),
          skills: customSelected.map((s) => s.name),
          description: bundleDescription.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setBundleError(data.error || "Export failed");
        setActing(false);
        return;
      }
      setBundleResult(await res.json());
      toast.success("Plugin exported successfully");
    } catch (e) {
      setBundleError(String(e));
    }
    setActing(false);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
    setSelected(new Set());
  };

  const skillKey = (s: SkillItem) =>
    `${s.origin}-${s.visibility}-${s.archived}-${s.projectPath || ""}-${s.name}`;

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageKeys = paginated.map(skillKey);
    const allSelected = pageKeys.every((k) => selected.has(k));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        pageKeys.forEach((k) => next.delete(k));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        pageKeys.forEach((k) => next.add(k));
        return next;
      });
    }
  };

  // Build unified skill list — plugin skills first so they win dedup over
  // user copies of the same skill (marketplace install copies to ~/.claude/skills/)
  const allSkills: SkillItem[] = useMemo(
    () => [
      ...(isClaude
        ? pluginSkills.map((s) => ({
            name: s.name,
            description: s.description,
            source: s.plugin || "plugin",
            isCustom: false,
            origin: "plugin" as const,
            visibility: "global" as const,
            archived: false,
            content: s.content,
            plugin: s.plugin,
            filePath: s.installPath
              ? `${s.installPath}/skills/${s.name}/SKILL.md`
              : undefined,
            provider: "claude" as const,
          }))
        : []),
      ...customSkills.map((s) => ({
        name: s.name,
        description: s.description,
        source:
          s.visibility === "project" ? ("project" as const) : ("global" as const),
        isCustom: true,
        origin: "user" as const,
        visibility: (s.visibility || "global") as "global" | "project",
        archived: false,
        projectPath: s.projectPath,
        projectName: s.projectName,
        disabled: s.disabled,
        category: s.category,
        workflow: s.workflow,
        filePath: s.filePath,
        provider: s.provider ?? provider,
      })),
      ...(isClaude
        ? archivedSkills.map((s) => ({
            name: s.name,
            description: s.description,
            source:
              s.visibility === "project"
                ? ("project" as const)
                : ("global" as const),
            isCustom: true,
            origin: "user" as const,
            visibility: s.visibility as "global" | "project",
            archived: true,
            projectPath: s.projectPath,
            projectName: s.projectName,
            disabled: true,
            category: s.category,
            filePath:
              s.visibility === "project" && s.projectPath
                ? `${s.projectPath}/.claude/skills/${s.name}/SKILL.md`
                : `~/.claude/skills/${s.name}/SKILL.md`,
            provider: "claude" as const,
          }))
        : []),
    ],
    [customSkills, pluginSkills, archivedSkills, provider, isClaude],
  );

  // Deduplicate: same-named skill at the same scope should appear only once.
  // Plugin skills are listed first, so they take precedence over user copies.
  const dedupedSkills = useMemo(() => {
    const seen = new Set<string>();
    return allSkills.filter((s) => {
      // Dedup key: name + scope (project path or global) + archived status
      const dedupKey = `${s.name}::${s.origin}::${s.projectPath || "global"}::${s.archived}`;
      if (seen.has(dedupKey)) return false;
      seen.add(dedupKey);
      return true;
    });
  }, [allSkills]);

  // Filter, sort, paginate
  const { sorted, totalPages } = useMemo(() => {
    const q = search.toLowerCase();
    let list = dedupedSkills;

    // Text search
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description?.toLowerCase().includes(q) ||
          s.projectName?.toLowerCase().includes(q) ||
          s.source.toLowerCase().includes(q),
      );
    }

    // Scope filter — maps UI filter values to field checks
    if (scopeFilter !== "all") {
      list = list.filter((s) => {
        if (scopeFilter === "global") return s.visibility === "global" && !s.archived;
        if (scopeFilter === "project") return s.visibility === "project" && !s.archived;
        if (scopeFilter === "plugin") return s.origin === "plugin";
        if (scopeFilter === "archived") return s.archived;
        return true;
      });
    }

    // Sort by (archived, origin, visibility) for scope column
    const scopeOrder = (s: SkillItem) => {
      if (s.archived) return 3;
      if (s.origin === "plugin") return 2;
      if (s.visibility === "project") return 1;
      return 0; // global user
    };
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sortField === "name") return a.name.localeCompare(b.name) * dir;
      if (sortField === "source") return a.source.localeCompare(b.source) * dir;
      if (sortField === "scope")
        return (scopeOrder(a) - scopeOrder(b)) * dir;
      return 0;
    });

    const tp = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    return { sorted: list, totalPages: tp };
  }, [dedupedSkills, search, scopeFilter, sortField, sortDir]);

  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page and selection when filters change
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [search, scopeFilter, provider]);

  // Computed selection metadata
  const selectedSkills = sorted.filter((s) => selected.has(skillKey(s)));
  const customSelected = selectedSkills.filter(
    (s) => s.origin !== "plugin" && !s.archived,
  );
  const pluginSelected = selectedSkills.filter(
    (s) => s.origin === "plugin",
  );
  const actionableSelected = [...customSelected, ...pluginSelected];
  const enabledCount = customSelected.filter((s) => !s.disabled).length;
  const disabledCount = customSelected.filter((s) => s.disabled).length;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown size={11} className="text-muted-foreground/30" />;
    return sortDir === "asc" ? (
      <ArrowUp size={11} className="text-foreground" />
    ) : (
      <ArrowDown size={11} className="text-foreground" />
    );
  };

  const scopeBadges = (skill: SkillItem) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge
        variant="outline"
        className={cn(
          "text-micro font-normal",
          skill.visibility === "global"
            ? "border-chart-5/30 text-chart-5"
            : "border-chart-2/30 text-chart-2",
        )}
        title={skill.visibility === "global" ? "Global" : "Project"}
      >
        {skill.visibility === "global" ? "Global" : "Project"}
      </Badge>
      {skill.archived && (
        <Badge
          variant="outline"
          className="text-micro font-normal border-muted-foreground/30 text-muted-foreground"
          title="Archived"
        >
          Archived
        </Badge>
      )}
    </div>
  );

  const providerLabel =
    provider === "claude"
      ? "Claude"
      : provider === "codex"
        ? "Codex"
        : "Gemini";

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground">
          Scoped to <span className="font-medium text-foreground">{providerLabel}</span>
        </div>
      </div>

      <DisabledStorageNote>
        {isClaude ? (
          <>
            Disable moves skills out of active context into{" "}
            <span className="font-mono">~/.claude/.disabled/skills</span>{" "}
            (global) or{" "}
            <span className="font-mono">.claude.local/disabled/skills</span>{" "}
            (project). Use the Enabled/Disabled pill in each row (or bulk actions) to
            disable/enable.
          </>
        ) : (
          <>
            Disable marks {provider} files with{" "}
            <span className="font-mono">.disabled</span> so they are skipped
            until re-enabled.
          </>
        )}
      </DisabledStorageNote>

      {paginated.length > 0 ? (
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/30">
                {isClaude && (
                  <TableHead className="h-8 px-2 sm:px-3 w-8 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={
                        paginated.length > 0 &&
                        paginated.every((s) => selected.has(skillKey(s)))
                      }
                      onChange={toggleSelectAll}
                      className="accent-primary h-3.5 w-3.5 cursor-pointer"
                    />
                  </TableHead>
                )}
                <TableHead className="h-8 px-2 sm:px-3 text-micro font-medium text-muted-foreground whitespace-normal">
                  <button
                    onClick={() => toggleSort("name")}
                    className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Name
                    <SortIcon field="name" />
                  </button>
                </TableHead>
                <TableHead className="hidden lg:table-cell h-8 px-2 sm:px-3 text-micro font-medium text-muted-foreground whitespace-normal">
                  Description
                </TableHead>
                <TableHead className="hidden md:table-cell h-8 px-2 sm:px-3 text-micro font-medium text-muted-foreground whitespace-normal w-[120px]">
                  <button
                    onClick={() => toggleSort("scope")}
                    className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Scope
                    <SortIcon field="scope" />
                  </button>
                </TableHead>
                <TableHead className="h-8 px-2 sm:px-3 text-micro font-medium text-muted-foreground whitespace-normal w-[34%] md:w-[28%]">
                  <button
                    onClick={() => toggleSort("source")}
                    className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                  >
                    Source
                    <SortIcon field="source" />
                  </button>
                </TableHead>
                <TableHead className="h-8 px-2 sm:px-3 text-micro font-medium text-muted-foreground w-[70px] whitespace-nowrap" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((skill) => (
                <TableRow
                  key={skillKey(skill)}
                  className={cn(
                    "group border-border/40",
                    skill.disabled && "opacity-40",
                  )}
                >
                  {/* Checkbox */}
                  {isClaude && (
                    <TableCell className="px-2 sm:px-3 py-2 w-8 whitespace-nowrap align-top">
                      <input
                        type="checkbox"
                        checked={selected.has(skillKey(skill))}
                        onChange={() => toggleSelect(skillKey(skill))}
                        className="accent-primary h-3.5 w-3.5 cursor-pointer"
                      />
                    </TableCell>
                  )}

                  {/* Name */}
                  <TableCell className="px-2 sm:px-3 py-2 whitespace-normal align-top">
                    <div className="min-w-0">
                      <div className="flex items-start gap-2 min-w-0">
                        <Sparkles
                          size={12}
                          className="text-chart-5 shrink-0 mt-0.5"
                        />
                        <span
                          className={cn(
                            "font-mono text-xs font-medium break-all sm:truncate",
                            skill.disabled &&
                              "line-through decoration-text-quaternary",
                          )}
                        >
                          {skill.name}
                        </span>
                      </div>
                      <div className="mt-0.5 pl-5 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {skill.isCustom && !skill.archived && (
                            <StatusPill
                              enabled={!skill.disabled}
                              onToggle={() =>
                                handleToggleSingleSkill(skill, !skill.disabled)
                              }
                              title={skill.disabled ? "Enable skill" : "Disable skill"}
                            />
                          )}
                          {skill.isCustom && !skill.disabled && (
                            <span className="text-micro text-text-quaternary font-mono break-all">
                              /{skill.name}
                            </span>
                          )}
                          {skill.disabled && !skill.isCustom && (
                            <span className="text-micro text-text-tertiary italic">
                              disabled
                            </span>
                          )}
                        </div>
                        <div className="md:hidden">{scopeBadges(skill)}</div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Description */}
                  <TableCell className="hidden lg:table-cell px-2 sm:px-3 py-2 whitespace-normal align-top">
                    {skill.description && skill.description.length > 120 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-muted-foreground line-clamp-2 xl:line-clamp-1 cursor-default break-words">
                            {skill.description.slice(0, 120)}…
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-sm">
                          <p className="text-xs">{skill.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-xs text-muted-foreground line-clamp-2 xl:line-clamp-1 break-words">
                        {skill.description || "—"}
                      </span>
                    )}
                  </TableCell>

                  {/* Scope */}
                  <TableCell className="hidden md:table-cell px-2 sm:px-3 py-2 whitespace-normal align-top">
                    {scopeBadges(skill)}
                  </TableCell>

                  {/* Source */}
                  <TableCell className="px-2 sm:px-3 py-2 whitespace-normal align-top">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {skill.origin === "plugin" && (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-micro font-normal border-chart-4/30 text-chart-4"
                          title="Plugin source"
                        >
                          Plugin
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground font-mono break-all">
                        {skill.workflow
                          ? "workflow"
                          : skill.visibility === "project"
                            ? skill.projectName || "project"
                            : skill.origin === "plugin"
                              ? skill.source
                              : "user"}
                      </span>
                    </div>
                    {skill.workflow && (
                      <Link href={`/workflows/${skill.workflow.id}`} className="inline-flex mt-0.5">
                        <Badge variant="blue" className="text-meta gap-1 hover:opacity-80 transition-opacity cursor-pointer">
                          <GitBranch size={9} />
                          {skill.workflow.name}
                        </Badge>
                      </Link>
                    )}
                    {!skill.workflow && skill.filePath && (
                      <span
                        className="hidden sm:block text-micro text-muted-foreground/60 font-mono break-all mt-0.5"
                        title={skill.filePath}
                      >
                        {skill.filePath.replace(/^\/Users\/[^/]+/, "~")}
                      </span>
                    )}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="px-2 sm:px-3 py-2 whitespace-nowrap align-top">
                    {skill.archived ? (
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => handleRestoreSkill(skill)}
                          className="p-1 hover:bg-chart-2/10 rounded transition-colors"
                          title="Restore"
                        >
                          <RotateCcw
                            size={11}
                            className="text-muted-foreground/60"
                          />
                        </button>
                        <button
                          onClick={() => handleDeleteArchivedSkill(skill)}
                          className="p-1 hover:bg-destructive/20 rounded transition-colors"
                          title="Delete permanently"
                        >
                          <Trash2
                            size={11}
                            className="text-muted-foreground/60"
                          />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-0.5">
                        {skill.filePath && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch("/api/filesystem/reveal", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ path: skill.filePath }),
                                });
                                if (!res.ok) {
                                  const data = await res.json();
                                  toast.error(data.error || "Failed to reveal file");
                                }
                              } catch {
                                toast.error("Failed to reveal file");
                              }
                            }}
                            className="p-1 hover:bg-chart-2/10 rounded transition-colors"
                            title="Reveal in Finder"
                          >
                            <FolderOpen
                              size={11}
                              className="text-muted-foreground/60"
                            />
                          </button>
                        )}
                        {skill.isCustom && (
                          <>
                            <button
                              onClick={() =>
                                setEditingSkill({
                                  name: skill.name,
                                  visibility: skill.visibility,
                                  projectPath: skill.projectPath,
                                  projectName: skill.projectName,
                                  provider:
                                    (skill.provider as ConfigProvider | undefined) ??
                                    provider,
                                })
                              }
                              className="p-1 hover:bg-chart-5/10 rounded transition-colors"
                            >
                              <Pencil
                                size={11}
                                className="text-muted-foreground/60"
                              />
                            </button>
                            <button
                              onClick={() => handleDeleteSkill(skill)}
                              className="p-1 hover:bg-destructive/20 rounded transition-colors"
                            >
                              <Trash2
                                size={11}
                                className="text-muted-foreground/60"
                              />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : search || scopeFilter !== "all" ? (
        <div className="text-xs text-text-tertiary py-6 text-center">
          No {provider === "codex" ? "instructions" : "skills"} match your filters
        </div>
      ) : provider === "codex" ? (
        <div className="text-xs text-text-tertiary py-6 text-center">
          No Codex skills found. Add skills under ~/.codex/skills/&lt;name&gt;/SKILL.md
        </div>
      ) : provider === "gemini" ? (
        <div className="text-xs text-text-tertiary py-6 text-center">
          No Gemini skills found. Add markdown files to ~/.gemini/velocity/skills/
        </div>
      ) : (
        <div className="text-xs text-text-tertiary py-6 text-center">
          No skills found.{" "}
          <button
            onClick={onCloseNewSkill}
            className="text-chart-5 hover:underline"
          >
            Create a custom skill
          </button>
        </div>
      )}

      {/* Footer: pagination */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <span className="text-detail tabular-nums">
            {sorted.length}{" "}
            {provider === "codex" ? "instruction" : "skill"}
            {sorted.length !== 1 ? "s" : ""}
            {isClaude && selected.size > 0 && (
              <span className="text-primary ml-1">
                • {selected.size} selected
              </span>
            )}
          </span>
          <TablePagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      </div>

      {/* Floating action bar — Claude only */}
      {isClaude && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-border bg-background/95 backdrop-blur-sm shadow-lg px-5 py-2.5">
          <span className="text-xs text-muted-foreground tabular-nums mr-1">
            {selected.size} selected
          </span>

          {enabledCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-xs gap-1.5 h-7"
              disabled={acting}
              onClick={() => handleToggleDisabled(true)}
            >
              <EyeOff size={12} />
              Disable{enabledCount > 1 ? ` (${enabledCount})` : ""}
            </Button>
          )}

          {disabledCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-xs gap-1.5 h-7"
              disabled={acting}
              onClick={() => handleToggleDisabled(false)}
            >
              <Eye size={12} />
              Enable{disabledCount > 1 ? ` (${disabledCount})` : ""}
            </Button>
          )}

          {actionableSelected.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-xs gap-1.5 h-7"
              disabled={acting}
              onClick={handleBulkArchive}
            >
              <Archive size={12} />
              Archive
              {actionableSelected.length > 1 ? ` (${actionableSelected.length})` : ""}
            </Button>
          )}

          {selected.size >= 2 && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-xs gap-1.5 h-7"
              disabled={acting}
              onClick={handleOpenMerge}
            >
              <Merge size={12} />
              Merge
            </Button>
          )}

          {customSelected.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-xs gap-1.5 h-7"
              disabled={acting}
              onClick={() => {
                setBundlePluginName("");
                setBundleDescription("");
                setBundleError("");
                setBundleResult(null);
                setShowBundleDialog(true);
              }}
            >
              <Package size={12} />
              Bundle
            </Button>
          )}

          {customSelected.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-xs gap-1.5 h-7 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              disabled={acting}
              onClick={handleBulkDelete}
            >
              <Trash2 size={12} />
              Delete
              {customSelected.length > 1 ? ` (${customSelected.length})` : ""}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="rounded-full h-7"
            onClick={() => setSelected(new Set())}
          >
            <X size={14} />
            Clear
          </Button>
        </div>
      )}

      {/* Bundle dialog */}
      <Dialog
        open={showBundleDialog}
        onOpenChange={(v) => !v && setShowBundleDialog(false)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Package size={14} />
              Bundle {customSelected.length} skill
              {customSelected.length !== 1 ? "s" : ""} as plugin
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-meta text-muted-foreground/60">
                Plugin name
              </label>
              <Input
                value={bundlePluginName}
                onChange={(e) => setBundlePluginName(e.target.value)}
                placeholder="my-plugin"
                className="h-7 text-xs font-mono mt-0.5"
              />
            </div>
            <div>
              <label className="text-meta text-muted-foreground/60">
                Description
              </label>
              <Input
                value={bundleDescription}
                onChange={(e) => setBundleDescription(e.target.value)}
                placeholder="Optional"
                className="h-7 text-xs mt-0.5"
              />
            </div>
            {bundleError && (
              <p className="text-xs text-destructive">{bundleError}</p>
            )}
            {bundleResult && (
              <div className="text-xs font-mono text-emerald-500 bg-emerald-500/5 rounded p-2 break-all">
                Exported to {bundleResult.path} ({bundleResult.structure.length}{" "}
                files)
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setShowBundleDialog(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs"
                disabled={!bundlePluginName.trim() || acting}
                onClick={handleExport}
              >
                {acting ? "Exporting..." : "Export Plugin"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create flow */}
      {
        <NewSkillDialog
          open={!!showNewSkillForm}
          provider={provider}
          onClose={onCloseNewSkill}
          onSuccess={() => {
            onCloseNewSkill();
            refreshAll();
          }}
        />
      }

      {/* Edit flow — opens SkillEditor directly */}
      {
        <SkillEditor
          open={!!editingSkill}
          skillName={editingSkill?.name}
          editVisibility={editingSkill?.visibility}
          editProjectPath={editingSkill?.projectPath}
          editProjectName={editingSkill?.projectName}
          provider={editingSkill?.provider ?? provider}
          onClose={() => setEditingSkill(null)}
          onSuccess={() => {
            setEditingSkill(null);
            refreshAll();
          }}
        />
      }

      {isClaude && (
        <SkillMergeSheet
          open={showMergeSheet}
          onClose={() => {
            setShowMergeSheet(false);
            setMergeSkills([]);
          }}
          skills={mergeSkills}
          onSuccess={() => {
            refreshAll();
          }}
        />
      )}
    </div>
    </TooltipProvider>
  );
}
