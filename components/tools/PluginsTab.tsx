"use client";

import { useState, useMemo, Fragment, useEffect } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/ui/table-pagination";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Puzzle,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import type { ToolInfo } from "@/hooks/useTools";

interface PluginsTabProps {
  plugins: ToolInfo[];
  pluginSkills: ToolInfo[];
  search: string;
  onRefresh: () => void;
}

type SortField = "name" | "version" | "skills" | "registry";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

function SortIcon({
  field,
  sortField,
  sortDir,
}: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
}) {
  if (sortField !== field)
    return <ArrowUpDown size={11} className="text-muted-foreground/30" />;
  return sortDir === "asc" ? (
    <ArrowUp size={11} className="text-foreground" />
  ) : (
    <ArrowDown size={11} className="text-foreground" />
  );
}

export function PluginsTab({
  plugins,
  pluginSkills,
  search,
  onRefresh,
}: PluginsTabProps) {
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const handleToggle = async (plugin: ToolInfo) => {
    const pluginId = plugin.pluginId;
    if (!pluginId) return;
    const isEnabled = plugin.enabled !== false;
    const newEnabled = !isEnabled;
    try {
      const res = await fetch("/api/tools/plugins", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pluginId,
          enabled: newEnabled,
          installPath: plugin.installPath,
        }),
      });
      if (!res.ok) throw new Error("Failed to toggle plugin");
      onRefresh();
      window.dispatchEvent(new CustomEvent("mcp:restart-sessions"));
    } catch {
      toast.error("Failed to toggle plugin");
    }
  };

  // Pre-compute skills per plugin
  const skillsByPlugin = useMemo(() => {
    const map: Record<string, ToolInfo[]> = {};
    for (const s of pluginSkills) {
      const key = s.plugin || "_unknown";
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return map;
  }, [pluginSkills]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
  };

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Filter, sort, paginate
  const { sorted, totalPages } = useMemo(() => {
    const q = search.toLowerCase();
    let list = plugins;

    if (q) {
      list = list.filter((p) => {
        if (
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
        )
          return true;
        // Also match if any child skill name matches
        const skills = skillsByPlugin[p.name] || [];
        return skills.some((s) => s.name.toLowerCase().includes(q));
      });
    }

    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      const aDisabled = a.enabled === false;
      const bDisabled = b.enabled === false;
      if (aDisabled !== bDisabled) return aDisabled ? 1 : -1;
      if (sortField === "name") return a.name.localeCompare(b.name) * dir;
      if (sortField === "version")
        return (a.version || "").localeCompare(b.version || "") * dir;
      if (sortField === "skills") {
        const ac = (skillsByPlugin[a.name] || []).length;
        const bc = (skillsByPlugin[b.name] || []).length;
        return (ac - bc) * dir;
      }
      if (sortField === "registry")
        return (a.registry || "").localeCompare(b.registry || "") * dir;
      return 0;
    });

    const tp = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    return { sorted: list, totalPages: tp };
  }, [plugins, search, sortField, sortDir, skillsByPlugin]);

  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when search changes
  useEffect(() => {
    setPage(0);
  }, [search]);

  if (sorted.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-text-tertiary py-6 text-center">
          {search
            ? `No plugins match \u201c${search}\u201d`
            : "No plugins installed."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border overflow-hidden">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 px-3" />
              <TableHead className="w-[20%]">
                <button
                  onClick={() => toggleSort("name")}
                  className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                >
                  Name
                  <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                </button>
              </TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[72px] whitespace-nowrap">
                <button
                  onClick={() => toggleSort("version")}
                  className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                >
                  Version
                  <SortIcon field="version" sortField={sortField} sortDir={sortDir} />
                </button>
              </TableHead>
              <TableHead className="w-[72px] whitespace-nowrap">
                <button
                  onClick={() => toggleSort("skills")}
                  className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                >
                  Skills
                  <SortIcon field="skills" sortField={sortField} sortDir={sortDir} />
                </button>
              </TableHead>
              <TableHead className="w-[15%] whitespace-nowrap">
                <button
                  onClick={() => toggleSort("registry")}
                  className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                >
                  Registry
                  <SortIcon field="registry" sortField={sortField} sortDir={sortDir} />
                </button>
              </TableHead>
              <TableHead className="w-[112px] whitespace-nowrap">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((plugin) => {
              const skills = skillsByPlugin[plugin.name] || [];
              const skillCount = skills.length;
              const isExpanded = expanded.has(plugin.name);
              const isEnabled = plugin.enabled !== false;

              return (
                <Fragment key={plugin.name}>
                  <TableRow
                    className={cn(
                      "group",
                      !isEnabled && "opacity-40",
                    )}
                  >
                    {/* Expand chevron */}
                    <TableCell className="w-8">
                      {skillCount > 0 ? (
                        <button
                          onClick={() => toggleExpand(plugin.name)}
                          className="p-0.5 hover:bg-muted/50 rounded transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown
                              size={12}
                              className="text-muted-foreground"
                            />
                          ) : (
                            <ChevronRight
                              size={12}
                              className="text-muted-foreground/50"
                            />
                          )}
                        </button>
                      ) : (
                        <span className="w-[18px]" />
                      )}
                    </TableCell>

                    {/* Name */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Puzzle size={12} className="text-chart-4 shrink-0" />
                        {plugin.url ? (
                          <a
                            href={plugin.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={plugin.name}
                            className={cn(
                              "font-mono text-xs font-medium truncate hover:text-chart-4 transition-colors inline-flex items-center gap-1",
                              !isEnabled && "line-through decoration-text-quaternary",
                            )}
                          >
                            {plugin.name}
                            <ExternalLink
                              size={9}
                              className="text-muted-foreground/40 shrink-0"
                            />
                          </a>
                        ) : (
                          <span
                            title={plugin.name}
                            className={cn(
                              "font-mono text-xs font-medium truncate",
                              !isEnabled && "line-through decoration-text-quaternary",
                            )}
                          >
                            {plugin.name}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Description */}
                    <TableCell className="overflow-hidden max-w-0">
                      <span className="text-xs text-muted-foreground truncate block" title={plugin.description}>
                        {plugin.description || "\u2014"}
                      </span>
                      {plugin.installPath && (
                        <span
                          className="text-xs text-muted-foreground/50 font-mono truncate block"
                          title={plugin.installPath}
                        >
                          {plugin.installPath}
                        </span>
                      )}
                    </TableCell>

                    {/* Version */}
                    <TableCell className="overflow-hidden">
                      {plugin.version ? (
                        <Badge
                          variant="outline"
                          className="text-micro font-normal border-chart-4/30 text-chart-4 max-w-full truncate"
                          title={`v${plugin.version}`}
                        >
                          v{plugin.version}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>

                    {/* Skills count */}
                    <TableCell className="overflow-hidden">
                      {skillCount > 0 ? (
                        <button
                          onClick={() => toggleExpand(plugin.name)}
                          className="cursor-pointer"
                        >
                          <Badge
                            variant="outline"
                            className="text-micro font-normal border-chart-5/30 text-chart-5 hover:bg-chart-5/10 transition-colors"
                          >
                            {skillCount} skill{skillCount !== 1 ? "s" : ""}
                          </Badge>
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          0
                        </span>
                      )}
                    </TableCell>

                    {/* Registry */}
                    <TableCell className="overflow-hidden">
                      <span className="text-xs text-muted-foreground font-mono truncate block" title={plugin.registry}>
                        {plugin.registry || "\u2014"}
                      </span>
                    </TableCell>

                    {/* Status toggle */}
                    <TableCell>
                      <div className="flex justify-start">
                        <StatusPill
                          enabled={isEnabled}
                          onToggle={() => handleToggle(plugin)}
                          title={isEnabled ? "Disable plugin" : "Enable plugin"}
                        />
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Expanded skill sub-rows */}
                  {isExpanded &&
                    skills.map((skill) => {
                      const charSize = skill.content?.length ?? 0;
                      const sizeLabel =
                        charSize >= 1000
                          ? `${(charSize / 1000).toFixed(1)}k chars`
                          : charSize > 0
                            ? `${charSize} chars`
                            : null;
                      return (
                        <TableRow
                          key={`${plugin.name}-${skill.name}`}
                          className="bg-muted/30"
                        >
                          <TableCell />
                          <TableCell className="pl-8 overflow-hidden">
                            <div className="flex items-center gap-2">
                              <Sparkles
                                size={11}
                                className="text-chart-5 shrink-0"
                              />
                              <span className="font-mono text-xs font-medium truncate" title={skill.name}>
                                {skill.name}
                              </span>
                              {sizeLabel && (
                                <Badge
                                  variant="outline"
                                  className="text-micro font-normal text-muted-foreground/50 border-border/30"
                                >
                                  {sizeLabel}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell colSpan={5} className="overflow-hidden max-w-0">
                            <span className="text-xs text-muted-foreground truncate block" title={skill.description}>
                              {skill.description || "\u2014"}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Footer: pagination */}
      <div className="flex items-center justify-end">
        <TablePagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
