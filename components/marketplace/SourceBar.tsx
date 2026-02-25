"use client";

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
import type { MarketplaceSource } from "@/types/marketplace";

const SOURCE_TYPE_LABELS: Record<string, string> = {
  github_search: "GitHub Search",
  github_org: "GitHub Org/User",
  github_repo: "GitHub Repo",
  registry: "Registry",
};

interface SourceBarProps {
  sources: MarketplaceSource[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function SourceBar({ sources, selectedId, onSelect }: SourceBarProps) {
  const ALL_SOURCES_VALUE = "__all_sources__";
  const hasSources = sources.length > 0;

  // Group sources by source_type
  const grouped = sources.reduce<Record<string, MarketplaceSource[]>>(
    (acc, src) => {
      const key = src.source_type;
      if (!acc[key]) acc[key] = [];
      acc[key].push(src);
      return acc;
    },
    {},
  );

  const groupOrder = ["github_search", "github_org", "github_repo", "registry"];
  const sortedGroups = groupOrder.filter((key) => grouped[key]?.length);

  return (
    <Select
      value={selectedId || ALL_SOURCES_VALUE}
      onValueChange={(value) =>
        onSelect(value === ALL_SOURCES_VALUE ? "" : value)
      }
      disabled={!hasSources}
    >
      <SelectTrigger size="sm" className="h-7 min-w-[168px] text-xs">
        <SelectValue placeholder={hasSources ? "All Sources" : "No Sources"} />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectItem value={ALL_SOURCES_VALUE} className="text-xs">
          All sources
        </SelectItem>
        {sortedGroups.length > 0 && <SelectSeparator />}
        {sortedGroups.map((type, i) => (
          <SelectGroup key={type}>
            <SelectLabel>{SOURCE_TYPE_LABELS[type] || type}</SelectLabel>
            {grouped[type].map((src) => (
              <SelectItem key={src.id} value={src.id} className="text-xs">
                {src.name}
              </SelectItem>
            ))}
            {i < sortedGroups.length - 1 && <SelectSeparator />}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
