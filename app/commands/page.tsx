"use client";

import { useState } from "react";
import { X, ExternalLink, Plus, Sparkles, Puzzle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import {
  getCommandsForProvider,
  CATEGORY_LABELS,
  fuzzyMatch,
  type CommandDef,
} from "@/lib/console/commands";
import { useSkills, type CustomSkill } from "@/hooks/useSkills";
import { useTools } from "@/hooks/useTools";
import { useProviderScopeStore } from "@/stores/providerScopeStore";

function CommandDetailPanel({
  command,
  onClose,
}: {
  command: CommandDef;
  onClose: () => void;
}) {
  return (
    <div className="mt-3 w-full max-h-[60vh] overflow-hidden rounded-xl border border-border/60 bg-background flex flex-col shrink-0 animate-in slide-in-from-right-2 duration-200 lg:mt-0 lg:max-h-none lg:w-[380px] lg:rounded-none lg:border lg:border-y-0 lg:border-r-0 lg:border-l lg:border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <code className="font-mono text-sm font-medium">/{command.name}</code>
        <button
          onClick={onClose}
          className="text-muted-foreground/75 hover:text-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Description */}
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5">
            Description
          </h4>
          <p className="text-xs text-foreground/90">{command.description}</p>
        </div>

        {/* Details */}
        {command.details && (
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5">
              Details
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {command.details}
            </p>
          </div>
        )}

        {/* Metadata */}
        <div className="space-y-2 pt-2 border-t border-border/30">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground/70">Category</span>
            <span className="text-muted-foreground">
              {CATEGORY_LABELS[command.category]}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground/70">Handler</span>
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-5 font-normal"
            >
              {command.handler}
            </Badge>
          </div>
          {command.route && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground/70">Route</span>
              <code className="text-[10px] font-mono text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                {command.route}
              </code>
            </div>
          )}
          {command.shortcut && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground/70">Shortcut</span>
              <kbd className="text-[10px] text-muted-foreground/75 bg-muted/50 px-1.5 py-0.5 rounded border border-border/50 font-mono">
                {command.shortcut}
              </kbd>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SkillDetailPanel({
  skill,
  onClose,
}: {
  skill: CustomSkill;
  onClose: () => void;
}) {
  const router = useRouter();
  return (
    <div className="mt-3 w-full max-h-[60vh] overflow-hidden rounded-xl border border-border/60 bg-background flex flex-col shrink-0 animate-in slide-in-from-right-2 duration-200 lg:mt-0 lg:max-h-none lg:w-[380px] lg:rounded-none lg:border lg:border-y-0 lg:border-r-0 lg:border-l lg:border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-1.5">
          <Sparkles size={12} className="text-chart-5" />
          <code className="font-mono text-sm font-medium">/{skill.name}</code>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground/75 hover:text-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {skill.description && (
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5">
              Description
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {skill.description}
            </p>
          </div>
        )}

        <div className="space-y-2 pt-2 border-t border-border/30">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground/70">Type</span>
            <span className="text-muted-foreground">
              {skill.workflow
                ? "Workflow Command"
                : skill.origin === "plugin"
                  ? "Plugin Skill"
                  : "Custom Skill"}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground/70">Origin</span>
            <span className="text-muted-foreground capitalize">
              {skill.origin}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground/70">Visibility</span>
            <span className="text-muted-foreground capitalize">
              {skill.visibility}
            </span>
          </div>
          {skill.category && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground/70">Category</span>
              <span className="text-muted-foreground capitalize">
                {skill.category.replace(/-/g, " ")}
              </span>
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-7 mt-2"
          onClick={() =>
            router.push(skill.workflow ? "/workflows" : "/skills")
          }
        >
          <ExternalLink size={11} className="mr-1.5" />
          {skill.workflow ? "View Workflow" : "Edit in Skills"}
        </Button>
      </div>
    </div>
  );
}

export default function CommandsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "builtin" | "custom">("all");
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"command" | "skill">(
    "command",
  );
  const providerScope = useProviderScopeStore((s) => s.providerScope);
  const router = useRouter();

  const groups = getCommandsForProvider(providerScope, search);
  const { data: skills } = useSkills(providerScope);
  const { data: tools = [] } = useTools(providerScope);

  const enabledPluginMap = new Map<string, boolean>();
  if (providerScope === "claude") {
    for (const tool of tools) {
      if (tool.type !== "plugin") continue;
      enabledPluginMap.set(tool.name, tool.enabled !== false);
    }
  }

  const pluginSkills: CustomSkill[] =
    providerScope === "claude"
      ? tools
          .filter((tool) => tool.type === "skill")
          .filter((tool) => {
            if (!tool.plugin) return true;
            return enabledPluginMap.get(tool.plugin) !== false;
          })
          .map((tool) => ({
            name: tool.name,
            description: tool.description,
            content: tool.content ?? "",
            origin: "plugin",
            visibility: "global",
            archived: false,
            disabled: false,
            provider: "claude",
          }))
      : [];

  // Plugin skills first so they take precedence on name collisions.
  const skillsByName = new Map<string, CustomSkill>();
  for (const skill of pluginSkills) {
    skillsByName.set(skill.name, skill);
  }
  for (const skill of skills ?? []) {
    if (!skillsByName.has(skill.name)) skillsByName.set(skill.name, skill);
  }

  // Filter to globally-available, active skills — disabled and project-scoped skills can't be invoked as commands
  const filteredSkills = Array.from(skillsByName.values()).filter(
    (s) =>
      !s.archived &&
      !s.disabled &&
      (s.origin === "plugin" || s.visibility === "global") &&
      (!search ||
        fuzzyMatch(search, s.name) ||
        fuzzyMatch(search, s.description ?? "")),
  );

  const builtinCount = groups.reduce((n, g) => n + g.commands.length, 0);
  const customCount = filteredSkills.length;
  const totalCount = builtinCount + customCount;

  const showBuiltin = filter === "all" || filter === "builtin";
  const showCustom = filter === "all" || filter === "custom";

  // Find selected items
  const selectedCmd =
    selectedType === "command"
      ? groups
          .flatMap((g) => g.commands)
          .find((c) => c.name === selectedCommand)
      : undefined;
  const selectedSkill =
    selectedType === "skill"
      ? filteredSkills.find((s) => s.name === selectedCommand)
      : undefined;

  const handleSelectCommand = (name: string) => {
    if (selectedCommand === name && selectedType === "command") {
      setSelectedCommand(null);
    } else {
      setSelectedCommand(name);
      setSelectedType("command");
    }
  };

  const handleSelectSkill = (name: string) => {
    if (selectedCommand === name && selectedType === "skill") {
      setSelectedCommand(null);
    } else {
      setSelectedCommand(name);
      setSelectedType("skill");
    }
  };

  return (
    <PageContainer fullHeight>
      <PageScaffold
        title="Commands"
        subtitle="Browse built-in slash commands and custom skill commands by provider, then inspect handlers and metadata."
        className="flex min-h-0 flex-1 flex-col"
        bodyClassName="flex-1 min-h-0"
      >
        <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-sm">
        <div className="flex h-full min-h-0 flex-col lg:flex-row overflow-hidden">
        {/* Left: command list */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-border/40 bg-muted/20 shrink-0">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <SearchField
                  placeholder="Filter commands..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  inputSize="sm"
                  containerClassName="w-full sm:w-72 md:w-80"
                />
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { key: "all", label: "All", count: totalCount },
                      { key: "builtin", label: "Built-in", count: builtinCount },
                      { key: "custom", label: "Custom", count: customCount },
                    ] as const
                  ).map(({ key, label, count }) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={filter === key ? "secondary" : "outline"}
                      onClick={() => setFilter(key)}
                      className="h-7 px-2.5 text-xs"
                    >
                      {label}
                      <span className="ml-1 opacity-70">{count}</span>
                    </Button>
                  ))}
                </div>
                <span className="rounded-md border border-border/50 bg-background px-2 py-1 text-[11px] text-muted-foreground tabular-nums">
                  {totalCount} items
                </span>
              </div>
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-6 px-4 py-4">
            {search &&
              (!showBuiltin || groups.length === 0) &&
              (!showCustom || filteredSkills.length === 0) && (
                <p className="text-xs text-muted-foreground py-8 text-center">
                  No commands match &ldquo;{search}&rdquo;
                </p>
              )}

            {showBuiltin &&
              groups.map((group) => (
                <div key={group.category}>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    {group.label}
                  </h3>
                  <div className="rounded-lg border border-border/50 divide-y divide-border/40">
                    {group.commands.map((cmd) => (
                      <button
                        key={cmd.name}
                        onClick={() => handleSelectCommand(cmd.name)}
                        className={`flex items-center gap-3 px-3 py-2 text-xs w-full text-left transition-colors ${
                          selectedCommand === cmd.name &&
                          selectedType === "command"
                            ? "bg-muted/50"
                            : "hover:bg-muted/40"
                        }`}
                      >
                        <code className="font-mono text-foreground shrink-0 w-28">
                          /{cmd.name}
                        </code>
                        <span className="text-muted-foreground flex-1 truncate">
                          {cmd.description}
                        </span>
                        {cmd.shortcut && (
                          <kbd className="text-[10px] text-muted-foreground/75 bg-muted/50 px-1.5 py-0.5 rounded border border-border/50 font-mono">
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

            {/* Custom commands (skills) */}
            {showCustom && filteredSkills.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    Custom
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground/75 hover:text-foreground px-1.5"
                    onClick={() => router.push("/skills")}
                  >
                    <Plus size={10} className="mr-1" />
                    New Command
                  </Button>
                </div>
                <div className="rounded-lg border border-border/50 divide-y divide-border/40">
                  {filteredSkills.map((skill) => (
                    <button
                      key={skill.name}
                      onClick={() => handleSelectSkill(skill.name)}
                      className={`flex items-center gap-3 px-3 py-2 text-xs w-full text-left transition-colors ${
                        selectedCommand === skill.name &&
                        selectedType === "skill"
                          ? "bg-muted/50"
                          : "hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 shrink-0 w-28">
                        {skill.origin === "plugin" ? (
                          <Puzzle size={10} className="text-chart-4 shrink-0" />
                        ) : (
                          <Sparkles size={10} className="text-chart-5 shrink-0" />
                        )}
                        <code className="font-mono text-foreground truncate">
                          /{skill.name}
                        </code>
                      </div>
                      <span className="text-muted-foreground flex-1 truncate">
                        {skill.description ??
                          (skill.origin === "plugin"
                            ? "Plugin skill"
                            : "Custom skill")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Show "New Command" CTA when no custom skills exist */}
            {showCustom && filteredSkills.length === 0 && !search && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground mb-2">
                  Custom
                </h3>
                <button
                  onClick={() => router.push("/skills")}
                  className="w-full rounded-lg border border-dashed border-border/50 px-3 py-4 text-xs text-muted-foreground/70 hover:text-muted-foreground hover:border-border/60 transition-colors text-center"
                >
                  <Plus size={12} className="inline mr-1.5 -mt-0.5" />
                  Create a custom command via Skills
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: detail panel */}
            {selectedCmd && (
              <CommandDetailPanel
                command={selectedCmd}
                onClose={() => setSelectedCommand(null)}
              />
            )}
            {selectedSkill && (
              <SkillDetailPanel
                skill={selectedSkill}
                onClose={() => setSelectedCommand(null)}
              />
            )}
          </div>
        </div>
      </PageScaffold>
    </PageContainer>
  );
}
