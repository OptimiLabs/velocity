"use client";

import { useState } from "react";
import type { AnalyticsFilters } from "@/hooks/useAnalytics";
import {
  getAllSessionProviders,
  getSessionProvider,
} from "@/lib/providers/session-registry";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, X, Check } from "lucide-react";

interface FilterBarProps {
  filters: AnalyticsFilters;
  onChange: (filters: AnalyticsFilters) => void;
  projects: { id: string; name: string }[];
  filterOptions: { models: string[]; agentTypes: string[]; providers?: string[] } | undefined;
  disabledDimensions?: string[];
}

type Dimension = "project" | "role" | "model" | "agentType" | "provider";

const DIMENSION_LABELS: Record<Dimension, string> = {
  project: "Project",
  role: "Role",
  model: "Model",
  agentType: "Agent Type",
  provider: "Provider",
};

const DIMENSION_ACCENTS: Record<Dimension, string> = {
  project: "bg-sky-500",
  role: "bg-violet-500",
  model: "bg-emerald-500",
  agentType: "bg-amber-500",
  provider: "bg-indigo-500",
};

const HIDDEN_PROJECT_IDS = new Set(["codex-sessions", "gemini-sessions"]);

function rowClasses(checked: boolean): string {
  return cn(
    "w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-md transition-colors",
    checked
      ? "bg-primary/10 text-primary"
      : "hover:bg-muted/70 text-foreground/90",
  );
}

function checkClasses(checked: boolean): string {
  return cn(
    "h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0",
    checked
      ? "bg-primary border-primary text-primary-foreground"
      : "border-border/70 bg-background",
  );
}

function formatModelName(model: string): string {
  if (model.startsWith("claude-")) {
    return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
  }
  return model;
}

function detectProviderForModel(model: string): string {
  const providers = getAllSessionProviders();
  for (const provider of providers) {
    if (provider.modelPrefixes.some((prefix) => model.startsWith(prefix))) {
      return provider.id;
    }
  }
  return "claude";
}

function modelMatchesProvider(model: string, provider: string): boolean {
  return detectProviderForModel(model) === provider;
}

function sortModelOptions(models: string[]): string[] {
  return [...models].sort((a, b) => {
    const pa = detectProviderForModel(a);
    const pb = detectProviderForModel(b);
    if (pa !== pb) return pa.localeCompare(pb);
    return formatModelName(a).localeCompare(formatModelName(b));
  });
}

export function FilterBar({
  filters,
  onChange,
  projects,
  filterOptions,
  disabledDimensions = [],
}: FilterBarProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [openChip, setOpenChip] = useState<Dimension | null>(null);
  const visibleProjects = projects.filter((p) => !HIDDEN_PROJECT_IDS.has(p.id));

  const activeDimensions: Dimension[] = [];
  if (filters.projectId) activeDimensions.push("project");
  if (filters.roles?.length) activeDimensions.push("role");
  if (filters.models?.length) activeDimensions.push("model");
  if (filters.agentTypes?.length) activeDimensions.push("agentType");
  if (filters.provider) activeDimensions.push("provider");
  const activeVisibleDimensions = activeDimensions.filter(
    (d) => !disabledDimensions.includes(d),
  );

  const availableDimensions: Dimension[] = (
    ["project", "role", "model", "agentType", "provider"] as Dimension[]
  ).filter((d) => !activeDimensions.includes(d) && !disabledDimensions.includes(d));

  function removeFilter(dim: Dimension) {
    const next = { ...filters };
    if (dim === "project") delete next.projectId;
    if (dim === "role") delete next.roles;
    if (dim === "model") {
      delete next.models;
      delete next.modelOp;
    }
    if (dim === "agentType") delete next.agentTypes;
    if (dim === "provider") delete next.provider;
    onChange(next);
  }

  function addDimension(dim: Dimension) {
    setAddOpen(false);
    // Seed newly added dimensions with a valid first value so the chip appears immediately.
    if (dim === "project" && visibleProjects.length > 0) {
      onChange({ ...filters, projectId: visibleProjects[0].id });
      return;
    }
    if (dim === "role") {
      onChange({ ...filters, roles: ["standalone"] });
      return;
    }
    if (dim === "provider") {
      const providerOptions =
        filterOptions?.providers ?? getAllSessionProviders().map((p) => p.id);
      if (providerOptions.length > 0) {
        onChange({ ...filters, provider: providerOptions[0] });
        return;
      }
      setOpenChip(dim);
      return;
    }
    if (dim === "agentType") {
      const types = filterOptions?.agentTypes ?? [];
      if (types.length > 0) {
        onChange({ ...filters, agentTypes: [types[0]] });
        return;
      }
      setOpenChip(dim);
      return;
    }
    if (dim === "model") {
      const allModels = sortModelOptions(filterOptions?.models ?? []);
      const providerScopedModels = filters.provider
        ? allModels.filter((m) => modelMatchesProvider(m, filters.provider!))
        : allModels;
      if (providerScopedModels.length > 0) {
        onChange({
          ...filters,
          models: [providerScopedModels[0]],
          modelOp: undefined,
        });
        return;
      }
      setOpenChip(dim);
      return;
    }
    setOpenChip(dim);
  }

  // Chip display value
  function chipLabel(dim: Dimension): string {
    switch (dim) {
      case "project": {
        const p = visibleProjects.find((project) => project.id === filters.projectId);
        return p?.name ?? filters.projectId ?? "";
      }
      case "role":
        return (filters.roles ?? [])
          .map((r) => r.charAt(0).toUpperCase() + r.slice(1))
          .join(", ");
      case "model":
        return (filters.models ?? []).map(formatModelName).join(", ");
      case "agentType":
        return (filters.agentTypes ?? []).join(", ");
      case "provider":
        return getSessionProvider(filters.provider!)?.label ?? filters.provider ?? "";
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Add Filter button */}
      {availableDimensions.length > 0 && (
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-full text-xs px-3 gap-1.5 border-border/70 bg-background/80"
            >
              <Plus size={12} />
              Add filter
              {activeVisibleDimensions.length > 0 && (
                <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary tabular-nums">
                  {activeVisibleDimensions.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1.5" align="start">
            {availableDimensions.map((dim) => (
              <button
                key={dim}
                className="w-full text-left text-xs px-2.5 py-2 rounded-md hover:bg-muted/70 transition-colors"
                onClick={() => addDimension(dim)}
              >
                {DIMENSION_LABELS[dim]}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {/* Active filter chips */}
      {activeVisibleDimensions.map((dim) => (
        <FilterChip
          key={dim}
          dimension={dim}
          label={DIMENSION_LABELS[dim]}
          value={chipLabel(dim)}
          isOpen={openChip === dim}
          onOpenChange={(open) => setOpenChip(open ? dim : null)}
          onRemove={() => removeFilter(dim)}
          filters={filters}
          onChange={onChange}
          projects={visibleProjects}
          filterOptions={filterOptions}
        />
      ))}
    </div>
  );
}

// Individual chip with popover editor
function FilterChip({
  dimension,
  label,
  value,
  isOpen,
  onOpenChange,
  onRemove,
  filters,
  onChange,
  projects,
  filterOptions,
}: {
  dimension: Dimension;
  label: string;
  value: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  filters: AnalyticsFilters;
  onChange: (filters: AnalyticsFilters) => void;
  projects: { id: string; name: string }[];
  filterOptions: { models: string[]; agentTypes: string[]; providers?: string[] } | undefined;
}) {
  const truncated = value.length > 30 ? value.slice(0, 28) + "\u2026" : value;
  const modelOp = filters.modelOp ?? "or";
  const showOpToggle =
    dimension === "model" && (filters.models?.length ?? 0) >= 2;
  const accent = DIMENSION_ACCENTS[dimension];

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <div className="group flex items-center gap-0 rounded-full border border-border/70 bg-background/85 text-xs overflow-hidden h-8 shadow-xs">
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 h-8 px-3 hover:bg-muted/50 transition-colors min-w-0">
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", accent)} />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/75 whitespace-nowrap">
              {label}
            </span>
            <span className="font-medium max-w-[160px] truncate">
              {truncated}
            </span>
            {showOpToggle && (
              <span
                className={cn(
                  "text-micro font-semibold uppercase px-1.5 rounded",
                  modelOp === "and"
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {modelOp}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <button
          className="h-8 w-8 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors border-l border-border/40"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X size={10} />
        </button>
      </div>
      <PopoverContent className="w-72 p-2 max-h-[360px] overflow-y-auto" align="start">
        <ChipEditor
          dimension={dimension}
          filters={filters}
          onChange={onChange}
          projects={projects}
          filterOptions={filterOptions}
        />
      </PopoverContent>
    </Popover>
  );
}

// Popover body with checkboxes / single-select
function ChipEditor({
  dimension,
  filters,
  onChange,
  projects,
  filterOptions,
}: {
  dimension: Dimension;
  filters: AnalyticsFilters;
  onChange: (filters: AnalyticsFilters) => void;
  projects: { id: string; name: string }[];
  filterOptions: { models: string[]; agentTypes: string[]; providers?: string[] } | undefined;
}) {
  if (dimension === "project") {
    return (
      <div className="space-y-0.5">
        <div className="text-micro uppercase text-muted-foreground font-medium px-1 pb-1">
          Project
        </div>
        {projects.map((p) => (
          <button
            key={p.id}
            className={rowClasses(filters.projectId === p.id)}
            onClick={() => onChange({ ...filters, projectId: p.id })}
          >
            <span className={checkClasses(filters.projectId === p.id)}>
              {filters.projectId === p.id && <Check size={10} />}
            </span>
            <span>
              {p.name}
            </span>
          </button>
        ))}
      </div>
    );
  }

  if (dimension === "role") {
    const selected = filters.roles ?? [];
    const options = [
      { value: "standalone", label: "Standalone" },
      { value: "subagent", label: "Subagent" },
    ];
    return (
      <div className="space-y-0.5">
        <div className="text-micro uppercase text-muted-foreground font-medium px-1 pb-1">
          Role
        </div>
        {options.map(({ value, label }) => {
          const checked = selected.includes(value);
          return (
            <button
              key={value}
              className={rowClasses(checked)}
              onClick={() => {
                const next = checked
                  ? selected.filter((r) => r !== value)
                  : [...selected, value];
                if (next.length === 0) return; // must have at least one
                onChange({ ...filters, roles: next });
              }}
            >
              <span className={checkClasses(checked)}>
                {checked && <Check size={10} />}
              </span>
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  if (dimension === "model") {
    const selected = filters.models ?? [];
    const options = sortModelOptions(filterOptions?.models ?? []);
    const modelOp = filters.modelOp ?? "or";
    const activeProvider = filters.provider;
    return (
      <div className="space-y-0.5">
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-micro uppercase text-muted-foreground font-medium">
            Model
          </span>
          {selected.length >= 2 && (
            <div className="flex rounded-md overflow-hidden border border-border/60">
              {(["or", "and"] as const).map((op) => (
                <button
                  key={op}
                  className={cn(
                    "text-micro font-semibold uppercase px-1.5 py-0.5 transition-colors",
                    modelOp === op
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                  onClick={() => onChange({ ...filters, modelOp: op })}
                >
                  {op}
                </button>
              ))}
            </div>
          )}
        </div>
        {activeProvider && (
          <div className="px-2 pb-1 text-[10px] text-muted-foreground">
            Showing {getSessionProvider(activeProvider)?.label ?? activeProvider} models
          </div>
        )}
        {options.map((m) => {
          const checked = selected.includes(m);
          const modelProvider = detectProviderForModel(m);
          return (
            <button
              key={m}
              className={rowClasses(checked)}
              onClick={() => {
                const next = checked
                  ? selected.filter((v) => v !== m)
                  : [...selected, m];
                onChange({
                  ...filters,
                  models: next.length ? next : undefined,
                });
              }}
            >
              <span className={checkClasses(checked)}>
                {checked && <Check size={10} />}
              </span>
              <span className="truncate">{formatModelName(m)}</span>
              {!activeProvider && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {getSessionProvider(modelProvider)?.label ?? modelProvider}
                </span>
              )}
            </button>
          );
        })}
        {options.length === 0 && (
          <div className="text-xs text-muted-foreground px-2 py-2">
            No models found in date range
          </div>
        )}
      </div>
    );
  }

  if (dimension === "agentType") {
    const selected = filters.agentTypes ?? [];
    const options = filterOptions?.agentTypes ?? [];
    return (
      <div className="space-y-0.5">
        <div className="text-micro uppercase text-muted-foreground font-medium px-1 pb-1">
          Agent Type
        </div>
        {options.map((t) => {
          const checked = selected.includes(t);
          return (
            <button
              key={t}
              className={rowClasses(checked)}
              onClick={() => {
                const next = checked
                  ? selected.filter((v) => v !== t)
                  : [...selected, t];
                onChange({
                  ...filters,
                  agentTypes: next.length ? next : undefined,
                });
              }}
            >
              <span className={checkClasses(checked)}>
                {checked && <Check size={10} />}
              </span>
              {t}
            </button>
          );
        })}
        {options.length === 0 && (
          <div className="text-xs text-muted-foreground px-2 py-2">
            No agent types found in date range
          </div>
        )}
      </div>
    );
  }

  if (dimension === "provider") {
    const options = filterOptions?.providers ?? ["claude", "codex", "gemini"];
    return (
      <div className="space-y-0.5">
        <div className="text-micro uppercase text-muted-foreground font-medium px-1 pb-1">
          Provider
        </div>
        {options.map((p) => {
          const checked = filters.provider === p;
          return (
            <button
              key={p}
              className={rowClasses(checked)}
              onClick={() => {
                const nextProvider = checked ? undefined : p;
                const next = { ...filters, provider: nextProvider };
                if (filters.models?.length) {
                  if (!nextProvider) {
                    next.models = filters.models;
                  } else {
                    const scoped = filters.models.filter((model) =>
                      modelMatchesProvider(model, nextProvider),
                    );
                    next.models = scoped.length ? scoped : undefined;
                  }
                  if (!next.models || next.models.length < 2) {
                    delete next.modelOp;
                  }
                }
                onChange(next);
              }}
            >
              <span className={checkClasses(checked)}>
                {checked && <Check size={10} />}
              </span>
              <span>
                {getSessionProvider(p)?.label ?? p}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return null;
}
