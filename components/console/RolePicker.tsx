"use client";

import { useAgents } from "@/hooks/useAgents";
import { ROLE_PRESETS } from "@/lib/roles/presets";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Code,
  SearchCheck,
  Blocks,
  FlaskConical,
  Layout,
  Server,
  Container,
  Compass,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  Code,
  SearchCheck,
  Blocks,
  FlaskConical,
  Layout,
  Server,
  Container,
  Compass,
};

export interface RoleSelection {
  type: "preset" | "agent" | "none";
  name: string;
  description: string;
}

interface RolePickerProps {
  value: RoleSelection | undefined;
  onChange: (selection: RoleSelection | undefined) => void;
  className?: string;
  placeholder?: string;
  showDescription?: boolean;
}

function serializeValue(sel: RoleSelection | undefined): string {
  if (!sel || sel.type === "none") return "__none__";
  return `${sel.type}::${sel.name}`;
}

function deserialize(
  value: string,
  agents: { name: string; description?: string }[],
): RoleSelection | undefined {
  if (value === "__none__") return undefined;
  const [type, name] = value.split("::");
  if (type === "preset") {
    const preset = ROLE_PRESETS.find((r) => r.name === name);
    if (preset)
      return {
        type: "preset",
        name: preset.name,
        description: preset.description,
      };
  }
  if (type === "agent") {
    const agent = agents.find((a) => a.name === name);
    if (agent)
      return {
        type: "agent",
        name: agent.name,
        description: agent.description || "",
      };
  }
  return undefined;
}

export function RolePicker({
  value,
  onChange,
  className,
  placeholder = "No role",
  showDescription = false,
}: RolePickerProps) {
  const { data: agents } = useAgents();

  const handleChange = (v: string) => {
    onChange(deserialize(v, agents || []));
  };

  const selectedPreset =
    value?.type === "preset"
      ? ROLE_PRESETS.find((r) => r.name === value.name)
      : undefined;

  const selectedAgent =
    value?.type === "agent"
      ? agents?.find((a) => a.name === value.name)
      : undefined;

  return (
    <div>
      <Select value={serializeValue(value)} onValueChange={handleChange}>
        <SelectTrigger className={cn("h-7 text-xs", className)}>
          <SelectValue placeholder={placeholder}>
            {selectedPreset && (
              <div className="flex items-center gap-1.5">
                <RoleIcon iconName={selectedPreset.icon} size={11} />
                <span>{selectedPreset.label}</span>
              </div>
            )}
            {selectedAgent && (
              <div className="flex items-center gap-1.5">
                {selectedAgent.color ? (
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: selectedAgent.color }}
                  />
                ) : (
                  <Bot size={11} className="text-muted-foreground shrink-0" />
                )}
                <span>{selectedAgent.name}</span>
                {selectedAgent.model && (
                  <span className="text-micro text-muted-foreground">
                    ({selectedAgent.model})
                  </span>
                )}
              </div>
            )}
            {!selectedPreset && !selectedAgent && placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{placeholder}</SelectItem>

          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Roles</SelectLabel>
            {ROLE_PRESETS.map((preset) => (
              <SelectItem
                key={`preset::${preset.name}`}
                value={`preset::${preset.name}`}
              >
                <div className="flex items-center gap-2">
                  <RoleIcon iconName={preset.icon} size={12} />
                  <div className="flex flex-col">
                    <span>{preset.label}</span>
                    <span className="text-meta text-muted-foreground leading-tight">
                      {preset.description}
                    </span>
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectGroup>

          {agents && agents.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Custom Agents</SelectLabel>
                {agents.map((agent) => (
                  <SelectItem
                    key={`agent::${agent.name}`}
                    value={`agent::${agent.name}`}
                  >
                    <div className="flex items-center gap-2">
                      {agent.color ? (
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: agent.color }}
                        />
                      ) : (
                        <Bot
                          size={12}
                          className="text-muted-foreground shrink-0"
                        />
                      )}
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span>{agent.name}</span>
                          {agent.model && (
                            <span className="text-micro text-muted-foreground">
                              ({agent.model})
                            </span>
                          )}
                        </div>
                        {agent.description && (
                          <span className="text-meta text-muted-foreground leading-tight">
                            {agent.description}
                          </span>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
      {showDescription && value && value.description && (
        <p className="text-meta text-muted-foreground/60 mt-1 pl-0.5 leading-tight">
          {value.description}
        </p>
      )}
    </div>
  );
}

function RoleIcon({
  iconName,
  size = 14,
}: {
  iconName: string;
  size?: number;
}) {
  const Icon = ICON_MAP[iconName];
  if (!Icon) return null;
  return <Icon size={size} className="text-muted-foreground shrink-0" />;
}
