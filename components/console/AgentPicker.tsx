"use client";

import { useAgents } from "@/hooks/useAgents";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface AgentPickerProps {
  value: string | undefined;
  onChange: (name: string | undefined) => void;
  className?: string;
}

export function AgentPicker({ value, onChange, className }: AgentPickerProps) {
  const { data: agents } = useAgents();

  return (
    <Select
      value={value || "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? undefined : v)}
    >
      <SelectTrigger className={cn("h-7 text-xs", className)}>
        <SelectValue placeholder="No agent" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">No agent</SelectItem>
        {agents?.map((agent) => (
          <SelectItem key={agent.name} value={agent.name}>
            <div className="flex items-center gap-2">
              {agent.color && (
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: agent.color }}
                />
              )}
              <span>{agent.name}</span>
              {agent.model && (
                <span className="text-micro text-muted-foreground">
                  ({agent.model})
                </span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
