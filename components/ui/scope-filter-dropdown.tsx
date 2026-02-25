"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ScopeFilter } from "@/types/scope";

interface ScopeFilterDropdownProps {
  value: ScopeFilter;
  onChange: (v: ScopeFilter) => void;
  showPlugin?: boolean;
  showArchived?: boolean;
}

export function ScopeFilterDropdown({
  value,
  onChange,
  showPlugin = false,
  showArchived = false,
}: ScopeFilterDropdownProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as ScopeFilter)}
    >
      <SelectTrigger size="sm" className="w-[136px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All scopes</SelectItem>
        <SelectItem value="global">Global</SelectItem>
        <SelectItem value="project">Project</SelectItem>
        {showPlugin && <SelectItem value="plugin">Plugin</SelectItem>}
        {showArchived && <SelectItem value="archived">Archived</SelectItem>}
      </SelectContent>
    </Select>
  );
}
