"use client";

import { useMemo } from "react";
import { ChevronDown, Puzzle, Server, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface ToolMultiSelectItem {
  name: string;
  type: "builtin" | "mcp" | "plugin" | "skill";
  description?: string;
}

interface ToolMultiSelectProps {
  tools: ToolMultiSelectItem[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyLabel?: string;
  className?: string;
}

const GROUP_ORDER: Array<ToolMultiSelectItem["type"]> = [
  "builtin",
  "mcp",
  "skill",
  "plugin",
];

const GROUP_LABEL: Record<ToolMultiSelectItem["type"], string> = {
  builtin: "Built-in",
  mcp: "MCP",
  skill: "Skills",
  plugin: "Plugins",
};

function ToolTypeIcon({ type }: { type: ToolMultiSelectItem["type"] }) {
  if (type === "mcp") return <Server size={12} className="text-chart-1" />;
  if (type === "skill") return <Puzzle size={12} className="text-chart-4" />;
  return <Wrench size={12} className="text-muted-foreground" />;
}

export function ToolMultiSelect({
  tools,
  selected,
  onChange,
  emptyLabel = "No tools selected",
  className,
}: ToolMultiSelectProps) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const groupedTools = useMemo(() => {
    const map = new Map<ToolMultiSelectItem["type"], ToolMultiSelectItem[]>();
    for (const type of GROUP_ORDER) map.set(type, []);
    for (const tool of tools) {
      if (!map.has(tool.type)) map.set(tool.type, []);
      map.get(tool.type)!.push(tool);
    }
    return GROUP_ORDER.map((type) => ({
      type,
      label: GROUP_LABEL[type] ?? type,
      items: map.get(type) ?? [],
    })).filter((group) => group.items.length > 0);
  }, [tools]);

  const summary =
    selected.length === 0
      ? emptyLabel
      : selected.length <= 2
        ? selected.join(", ")
        : `${selected.length} selected`;

  const toggle = (name: string, checked: boolean) => {
    const next = new Set(selectedSet);
    if (checked) next.add(name);
    else next.delete(name);
    onChange(Array.from(next));
  };

  if (tools.length === 0) {
    return (
      <div className={cn("text-xs text-muted-foreground", className)}>
        Loading tools...
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-8 w-full justify-between text-xs font-normal",
            className,
          )}
        >
          <span className="truncate text-left">{summary}</span>
          <ChevronDown size={12} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 max-h-80 overflow-y-auto">
        {groupedTools.map((group, index) => (
          <div key={group.type}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.items.map((tool) => (
              <DropdownMenuCheckboxItem
                key={`${group.type}:${tool.name}`}
                checked={selectedSet.has(tool.name)}
                onCheckedChange={(checked) => toggle(tool.name, checked === true)}
                onSelect={(event) => event.preventDefault()}
                className="text-xs"
                title={tool.description}
              >
                <ToolTypeIcon type={tool.type} />
                <span className="font-mono">{tool.name}</span>
              </DropdownMenuCheckboxItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
