"use client";

import { PackageCard } from "./PackageCard";
import { CollapsibleSection } from "@/components/tools/CollapsibleSection";
import type { MarketplaceItem } from "@/types/marketplace";

type GroupedItems = { label: string; items: MarketplaceItem[] }[];

interface PackageGridProps {
  groups: GroupedItems;
  loading: boolean;
  searched: boolean;
  installingName: string | null;
  installingAllName: string | null;
  uninstallingName: string | null;
  togglingName: string | null;
  selectedKeys: Set<string>;
  getKey: (item: MarketplaceItem) => string;
  isSelectable: (item: MarketplaceItem) => boolean;
  canInstall: (item: MarketplaceItem) => boolean;
  canInstallAll: (item: MarketplaceItem) => boolean;
  installAllTitle: (item: MarketplaceItem) => string | undefined;
  installDisabledReason: (item: MarketplaceItem) => string | undefined;
  isDetailable: (item: MarketplaceItem) => boolean;
  onSelect: (item: MarketplaceItem, selected: boolean) => void;
  onInstall: (item: MarketplaceItem) => void;
  onInstallAll: (item: MarketplaceItem) => void;
  onUninstall: (item: MarketplaceItem) => void;
  onToggleInstalled: (item: MarketplaceItem) => void;
  onDetails: (item: MarketplaceItem) => void;
}

function GridCards({
  items,
  installingName,
  installingAllName,
  uninstallingName,
  togglingName,
  selectedKeys,
  getKey,
  isSelectable,
  canInstall,
  canInstallAll,
  installAllTitle,
  installDisabledReason,
  isDetailable,
  onSelect,
  onInstall,
  onInstallAll,
  onUninstall,
  onToggleInstalled,
  onDetails,
}: {
  items: MarketplaceItem[];
  installingName: string | null;
  installingAllName: string | null;
  uninstallingName: string | null;
  togglingName: string | null;
  selectedKeys: Set<string>;
  getKey: (item: MarketplaceItem) => string;
  isSelectable: (item: MarketplaceItem) => boolean;
  canInstall: (item: MarketplaceItem) => boolean;
  canInstallAll: (item: MarketplaceItem) => boolean;
  installAllTitle: (item: MarketplaceItem) => string | undefined;
  installDisabledReason: (item: MarketplaceItem) => string | undefined;
  isDetailable: (item: MarketplaceItem) => boolean;
  onSelect: (item: MarketplaceItem, selected: boolean) => void;
  onInstall: (item: MarketplaceItem) => void;
  onInstallAll: (item: MarketplaceItem) => void;
  onUninstall: (item: MarketplaceItem) => void;
  onToggleInstalled: (item: MarketplaceItem) => void;
  onDetails: (item: MarketplaceItem) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((item) => (
        <PackageCard
          key={item.url}
          item={item}
          recommended={Boolean(item.recommended)}
          installing={installingName === getKey(item)}
          installingAll={installingAllName === getKey(item)}
          uninstalling={uninstallingName === getKey(item)}
          toggling={togglingName === getKey(item)}
          selected={selectedKeys.has(getKey(item))}
          selectable={isSelectable(item)}
          installDisabled={!canInstall(item)}
          installDisabledReason={installDisabledReason(item)}
          canInstallAll={canInstallAll(item)}
          installAllLabel={installAllTitle(item)}
          onSelectChange={(checked) => onSelect(item, checked)}
          onInstall={() => onInstall(item)}
          onInstallAll={() => onInstallAll(item)}
          onUninstall={() => onUninstall(item)}
          onToggleInstalled={() => onToggleInstalled(item)}
          onDetails={isDetailable(item) ? () => onDetails(item) : undefined}
        />
      ))}
    </div>
  );
}

export function PackageGrid({
  groups,
  loading,
  searched,
  installingName,
  installingAllName,
  uninstallingName,
  togglingName,
  selectedKeys,
  getKey,
  isSelectable,
  canInstall,
  canInstallAll,
  installAllTitle,
  installDisabledReason,
  isDetailable,
  onSelect,
  onInstall,
  onInstallAll,
  onUninstall,
  onToggleInstalled,
  onDetails,
}: PackageGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="border border-border rounded-lg p-4 animate-pulse space-y-2"
          >
            <div className="h-4 bg-muted rounded w-2/3" />
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);

  if (totalItems > 0) {
    // Ungrouped: single group with no label
    if (groups.length === 1 && !groups[0].label) {
      return (
        <GridCards
          items={groups[0].items}
          installingName={installingName}
          installingAllName={installingAllName}
          uninstallingName={uninstallingName}
          togglingName={togglingName}
          selectedKeys={selectedKeys}
          getKey={getKey}
          isSelectable={isSelectable}
          canInstall={canInstall}
          canInstallAll={canInstallAll}
          installAllTitle={installAllTitle}
          installDisabledReason={installDisabledReason}
          isDetailable={isDetailable}
          onSelect={onSelect}
          onInstall={onInstall}
          onInstallAll={onInstallAll}
          onUninstall={onUninstall}
          onToggleInstalled={onToggleInstalled}
          onDetails={onDetails}
        />
      );
    }

    return (
      <div className="space-y-3">
        {groups.map((group) => (
          <CollapsibleSection
            key={group.label}
            title={group.label}
            count={group.items.length}
          >
            <GridCards
              items={group.items}
              installingName={installingName}
              installingAllName={installingAllName}
              uninstallingName={uninstallingName}
              togglingName={togglingName}
              selectedKeys={selectedKeys}
              getKey={getKey}
              isSelectable={isSelectable}
              canInstall={canInstall}
              canInstallAll={canInstallAll}
              installAllTitle={installAllTitle}
              installDisabledReason={installDisabledReason}
              isDetailable={isDetailable}
              onSelect={onSelect}
              onInstall={onInstall}
              onInstallAll={onInstallAll}
              onUninstall={onUninstall}
              onToggleInstalled={onToggleInstalled}
              onDetails={onDetails}
            />
          </CollapsibleSection>
        ))}
      </div>
    );
  }

  if (searched) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No results found</p>
        <p className="text-xs mt-1">
          Try a different search term, filter, or source.
        </p>
      </div>
    );
  }

  return null;
}
