"use client";

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchField } from "@/components/ui/search-field";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/ui/date-range-picker";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutGrid,
  List,
  Network,
  X,
  Hash,
  DollarSign,
  TrendingUp,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/types/session";
import { getAllSessionProviders } from "@/lib/providers/session-registry";
import { formatCost } from "@/lib/cost/calculator";

export type ViewMode = "grid" | "list" | "task";

function formatModelName(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

function formatProviderName(providerId: string): string {
  const known = getAllSessionProviders().find((def) => def.id === providerId);
  return known?.label ?? providerId.charAt(0).toUpperCase() + providerId.slice(1);
}

function formatEffortModeLabel(mode: string): string {
  const normalized = mode.trim().toLowerCase();
  if (!normalized) return mode;
  if (normalized === "xhigh") return "XHigh";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

interface SessionFiltersProps {
  projects: Project[];
  selectedProject: string | undefined;
  onProjectChange: (projectId: string | undefined) => void;
  search: string;
  onSearchChange: (search: string) => void;
  sortBy: string;
  onSortChange: (sortBy: string) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  role?: string;
  onRoleChange?: (role: string | undefined) => void;
  models?: string[];
  model?: string;
  onModelChange?: (model: string | undefined) => void;
  agentTypes?: string[];
  agentType?: string;
  onAgentTypeChange?: (type: string | undefined) => void;
  effortModes?: string[];
  effortMode?: string;
  onEffortModeChange?: (mode: string | undefined) => void;
  providers?: string[];
  provider?: string;
  onProviderChange?: (provider: string | undefined) => void;
  compressionState?: "active" | "compressed" | "all";
  onCompressionStateChange?: (
    state: "active" | "compressed" | "all",
  ) => void;
  summaryMetrics?: {
    totalSessions: number;
    totalCost: number;
    avgCost: number;
    totalMessages: number;
  };
}

interface ActiveFilterChip {
  key: string;
  label: string;
  value: string;
  onClear: () => void;
}

type InlineFilterDimension =
  | "role"
  | "project"
  | "model"
  | "agentType"
  | "effortMode";

export function SessionFilters({
  projects,
  selectedProject,
  onProjectChange,
  search,
  onSearchChange,
  sortBy,
  onSortChange,
  dateRange,
  onDateRangeChange,
  viewMode = "grid",
  onViewModeChange,
  role,
  onRoleChange,
  models,
  model,
  onModelChange,
  agentTypes,
  agentType,
  onAgentTypeChange,
  effortModes,
  effortMode,
  onEffortModeChange,
  providers,
  provider,
  onProviderChange,
  compressionState = "active",
  onCompressionStateChange,
  summaryMetrics,
}: SessionFiltersProps) {
  const [activeDimension, setActiveDimension] =
    useState<InlineFilterDimension>("role");

  const providerList = useMemo(
    () => {
      const registryProviders = getAllSessionProviders().map((def) => def.id);
      return Array.from(new Set([...(providers ?? []), ...registryProviders]));
    },
    [providers],
  );

  const projectLabel = useMemo(() => {
    if (!selectedProject) return "";
    return (
      projects.find((project) => project.id === selectedProject)?.name ??
      selectedProject
    );
  }, [projects, selectedProject]);

  const hasProviderFilter = !!onProviderChange;
  const hasCompressionFilter = !!onCompressionStateChange;
  const hasRoleFilter = !!onRoleChange;
  const hasProjectFilter = projects.length > 0;
  const hasModelFilter = !!onModelChange && !!models?.length;
  const hasAgentTypeFilter = !!onAgentTypeChange && !!agentTypes?.length;
  const hasEffortModeFilter = !!onEffortModeChange && !!effortModes?.length;

  const inlineDimensions = useMemo(() => {
    const options: Array<{ value: InlineFilterDimension; label: string }> = [];
    if (hasRoleFilter) options.push({ value: "role", label: "Role" });
    if (hasProjectFilter) options.push({ value: "project", label: "Project" });
    if (hasModelFilter) options.push({ value: "model", label: "Model" });
    if (hasAgentTypeFilter)
      options.push({ value: "agentType", label: "Agent Type" });
    if (hasEffortModeFilter)
      options.push({ value: "effortMode", label: "Mode" });
    return options;
  }, [
    hasRoleFilter,
    hasProjectFilter,
    hasModelFilter,
    hasAgentTypeFilter,
    hasEffortModeFilter,
  ]);

  const appliedQuickDimension = useMemo<InlineFilterDimension | null>(() => {
    if (role) return "role";
    if (selectedProject) return "project";
    if (model) return "model";
    if (agentType) return "agentType";
    if (effortMode) return "effortMode";
    return null;
  }, [role, selectedProject, model, agentType, effortMode]);

  const selectedDimension = useMemo(() => {
    if (inlineDimensions.length === 0) return null;
    if (
      appliedQuickDimension &&
      inlineDimensions.some((d) => d.value === appliedQuickDimension)
    ) {
      return appliedQuickDimension;
    }
    if (inlineDimensions.some((d) => d.value === activeDimension)) {
      return activeDimension;
    }
    return inlineDimensions[0].value;
  }, [inlineDimensions, activeDimension, appliedQuickDimension]);

  const valueOptions = useMemo(() => {
    if (!selectedDimension) return [] as Array<{ value: string; label: string }>;

    if (selectedDimension === "role") {
      return [
        { value: "standalone", label: "Standalone" },
        { value: "subagent", label: "Subagent" },
      ];
    }

    if (selectedDimension === "project") {
      return projects.map((project) => ({
        value: project.id,
        label: `${project.name} (${project.session_count})`,
      }));
    }

    if (selectedDimension === "model") {
      return (models ?? []).map((m) => ({
        value: m,
        label: formatModelName(m),
      }));
    }

    if (selectedDimension === "agentType") {
      return (agentTypes ?? []).map((t) => ({ value: t, label: t }));
    }

    return (effortModes ?? []).map((mode) => ({
      value: mode,
      label: formatEffortModeLabel(mode),
    }));
  }, [selectedDimension, projects, models, agentTypes, effortModes]);

  const activeDimensionValue = useMemo(() => {
    if (!selectedDimension) return undefined;
    if (selectedDimension === "role") return role;
    if (selectedDimension === "project") return selectedProject;
    if (selectedDimension === "model") return model;
    if (selectedDimension === "agentType") return agentType;
    return effortMode;
  }, [selectedDimension, role, selectedProject, model, agentType, effortMode]);

  const activeDimensionLabel = useMemo(() => {
    if (!selectedDimension) return "value";
    return (
      inlineDimensions.find((d) => d.value === selectedDimension)?.label.toLowerCase() ??
      "value"
    );
  }, [selectedDimension, inlineDimensions]);

  const clearNonProviderFilters = (keep?: InlineFilterDimension) => {
    if (keep !== "role" && role && onRoleChange) onRoleChange(undefined);
    if (keep !== "project" && selectedProject) onProjectChange(undefined);
    if (keep !== "model" && model && onModelChange) onModelChange(undefined);
    if (keep !== "agentType" && agentType && onAgentTypeChange) {
      onAgentTypeChange(undefined);
    }
    if (keep !== "effortMode" && effortMode && onEffortModeChange) {
      onEffortModeChange(undefined);
    }
  };

  const setActiveDimensionValue = (value: string | undefined) => {
    if (!selectedDimension) return;
    if (!value) {
      clearNonProviderFilters();
      return;
    }
    clearNonProviderFilters(selectedDimension);
    if (selectedDimension === "role") {
      onRoleChange?.(value);
      return;
    }
    if (selectedDimension === "project") {
      onProjectChange(value);
      return;
    }
    if (selectedDimension === "model") {
      onModelChange?.(value);
      return;
    }
    if (selectedDimension === "agentType") {
      onAgentTypeChange?.(value);
      return;
    }
    onEffortModeChange?.(value);
  };

  const activeFilters = useMemo(() => {
    const chips: ActiveFilterChip[] = [];

    if (provider && onProviderChange) {
      chips.push({
        key: "provider",
        label: "Provider",
        value: formatProviderName(provider),
        onClear: () => onProviderChange(undefined),
      });
    }

    if (hasCompressionFilter && compressionState !== "active") {
      chips.push({
        key: "compressionState",
        label: "State",
        value:
          compressionState === "compressed" ? "Compressed" : "All sessions",
        onClear: () => onCompressionStateChange?.("active"),
      });
    }

    if (role && onRoleChange) {
      chips.push({
        key: "role",
        label: "Role",
        value: role === "subagent" ? "Subagent" : "Standalone",
        onClear: () => onRoleChange(undefined),
      });
    }

    if (selectedProject) {
      chips.push({
        key: "project",
        label: "Project",
        value: projectLabel,
        onClear: () => onProjectChange(undefined),
      });
    }

    if (model && onModelChange) {
      chips.push({
        key: "model",
        label: "Model",
        value: formatModelName(model),
        onClear: () => onModelChange(undefined),
      });
    }

    if (agentType && onAgentTypeChange) {
      chips.push({
        key: "agentType",
        label: "Agent",
        value: agentType,
        onClear: () => onAgentTypeChange(undefined),
      });
    }

    if (effortMode && onEffortModeChange) {
      chips.push({
        key: "effortMode",
        label: "Mode",
        value: formatEffortModeLabel(effortMode),
        onClear: () => onEffortModeChange(undefined),
      });
    }

    return chips;
  }, [
    provider,
    onProviderChange,
    role,
    onRoleChange,
    selectedProject,
    projectLabel,
    onProjectChange,
    model,
    onModelChange,
    agentType,
    onAgentTypeChange,
    effortMode,
    onEffortModeChange,
    hasCompressionFilter,
    compressionState,
    onCompressionStateChange,
  ]);

  const activeFilterCount = activeFilters.length;

  const clearAllFilters = () => {
    if (provider && onProviderChange) onProviderChange(undefined);
    if (hasCompressionFilter) onCompressionStateChange?.("active");
    if (role && onRoleChange) onRoleChange(undefined);
    if (selectedProject) onProjectChange(undefined);
    if (model && onModelChange) onModelChange(undefined);
    if (agentType && onAgentTypeChange) onAgentTypeChange(undefined);
    if (effortMode && onEffortModeChange) onEffortModeChange(undefined);
  };

  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search sessions..."
          inputSize="sm"
          containerClassName="w-full sm:w-72 md:w-80"
        />

        {inlineDimensions.length > 0 && (
          <>
            <Select
              value={selectedDimension ?? inlineDimensions[0].value}
              onValueChange={(v) => {
                const next = v as InlineFilterDimension;
                setActiveDimension(next);
                if (selectedDimension && selectedDimension !== next) {
                  clearNonProviderFilters();
                }
              }}
            >
              <SelectTrigger size="sm" className="min-w-[120px] text-xs">
                <SelectValue placeholder="Filter by" />
              </SelectTrigger>
              <SelectContent>
                {inlineDimensions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={activeDimensionValue || "all"}
              onValueChange={(v) =>
                setActiveDimensionValue(v === "all" ? undefined : v)
              }
              disabled={!selectedDimension || valueOptions.length === 0}
            >
              <SelectTrigger size="sm" className="min-w-[170px] text-xs">
                <SelectValue
                  placeholder={
                    selectedDimension ? `Select ${activeDimensionLabel}` : "Select value"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {valueOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {viewMode !== "list" && (
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger size="sm" className="min-w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="modified_at">Recently modified</SelectItem>
              <SelectItem value="created_at">Recently created</SelectItem>
              <SelectItem value="cost">Highest cost</SelectItem>
              <SelectItem value="messages">Most messages</SelectItem>
              <SelectItem value="tokens">Most tokens</SelectItem>
            </SelectContent>
          </Select>
        )}

        <DateRangePicker value={dateRange} onChange={onDateRangeChange} />

        <div className="ml-auto flex items-center gap-2">
          {onViewModeChange && (
            <div className="flex items-center rounded-md border border-border/50 h-7">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onViewModeChange("list")}
                    className={cn(
                      "px-2 h-full flex items-center transition-colors rounded-l-md",
                      viewMode === "list"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    title="List view"
                    aria-label="List view"
                  >
                    <List size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  List view: rows with sortable columns.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onViewModeChange("grid")}
                    className={cn(
                      "px-2 h-full flex items-center transition-colors",
                      viewMode === "grid"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    title="Grid view"
                    aria-label="Grid view"
                  >
                    <LayoutGrid size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Grid view: cards with quick metadata and actions.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onViewModeChange("task")}
                    className={cn(
                      "px-2 h-full flex items-center transition-colors rounded-r-md",
                      viewMode === "task"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    title="Task view"
                    aria-label="Task view"
                  >
                    <Network size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Task view: grouped sessions by task/subtask flow.
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          {hasProviderFilter && (
            <Select
              value={provider || "all"}
              onValueChange={(v) =>
                onProviderChange?.(v === "all" ? undefined : v)
              }
            >
              <SelectTrigger size="sm" className="min-w-[128px] text-xs">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {providerList.map((p) => (
                  <SelectItem key={p} value={p}>
                    {formatProviderName(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {hasCompressionFilter && (
            <Select
              value={compressionState}
              onValueChange={(v) =>
                onCompressionStateChange?.(
                  v as "active" | "compressed" | "all",
                )
              }
            >
              <SelectTrigger size="sm" className="min-w-[138px] text-xs">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active sessions</SelectItem>
                <SelectItem value="compressed">Compressed</SelectItem>
                <SelectItem value="all">All sessions</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {(activeFilterCount > 0 || summaryMetrics) && (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {activeFilters.map((filter) => (
              <div
                key={filter.key}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-card px-2 py-1 text-xs"
              >
                <span className="text-muted-foreground">{filter.label}:</span>
                <span className="font-medium">{filter.value}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={filter.onClear}
                  aria-label={`Clear ${filter.label} filter`}
                >
                  <X size={11} />
                </button>
              </div>
            ))}
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={clearAllFilters}
              >
                Clear all
              </Button>
            )}
          </div>

          {summaryMetrics && (
            <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
              <span className="inline-flex items-center gap-1">
                <Hash size={11} className="text-muted-foreground/60" />
                {summaryMetrics.totalSessions.toLocaleString()} sessions
              </span>
              <span className="inline-flex items-center gap-1">
                <DollarSign size={11} className="text-muted-foreground/60" />
                {formatCost(summaryMetrics.totalCost)} total
              </span>
              <span className="inline-flex items-center gap-1">
                <TrendingUp size={11} className="text-muted-foreground/60" />
                {formatCost(summaryMetrics.avgCost)} avg
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageSquare size={11} className="text-muted-foreground/60" />
                {summaryMetrics.totalMessages.toLocaleString()} messages
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
