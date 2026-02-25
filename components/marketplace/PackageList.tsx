"use client";

import {
  Star,
  ExternalLink,
  Download,
  Loader2,
  Trash2,
  Plug,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CollapsibleSection } from "@/components/tools/CollapsibleSection";
import { TYPE_ICONS, TYPE_COLORS } from "@/components/marketplace/PackageCard";
import {
  getMarketplaceProviderSupportLabel,
  getMarketplaceTypeLabel,
} from "@/lib/marketplace/provider-support";
import type { MarketplaceItem } from "@/types/marketplace";

type GroupedItems = { label: string; items: MarketplaceItem[] }[];

interface PackageListProps {
  groups: GroupedItems;
  loading: boolean;
  searched: boolean;
  installingName: string | null;
  installingAllName: string | null;
  uninstallingName: string | null;
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
  onDetails?: (item: MarketplaceItem) => void;
}

function ListTable({
  items,
  installingName,
  installingAllName,
  uninstallingName,
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
  onDetails,
}: {
  items: MarketplaceItem[];
  installingName: string | null;
  installingAllName: string | null;
  uninstallingName: string | null;
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
  onDetails?: (item: MarketplaceItem) => void;
}) {
  return (
    <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 text-xs text-muted-foreground font-medium">
        <div className="w-5" />
        <div className="w-4" />
        <div className="w-56 shrink-0">Name</div>
        <div className="flex-1 hidden md:block">Description</div>
        <div className="w-20 text-center hidden sm:block">Type</div>
        <div className="w-16 text-center hidden sm:block">Stars</div>
        <div className="w-24 text-center hidden md:block">Tokens</div>
        <div className="w-20 text-right hidden lg:block">Author</div>
        <div className="w-32 text-right">Action</div>
      </div>
      {items.map((item) => {
        const installing = installingName === getKey(item);
        const installingAll = installingAllName === getKey(item);
        const uninstalling = uninstallingName === getKey(item);
        const selectable = isSelectable(item);
        const selected = selectedKeys.has(getKey(item));
        const detailable = isDetailable(item);
        const installable = canInstall(item);
        const installableAll = canInstallAll(item);

        return (
          <div
            key={item.url}
            className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors group${detailable ? " cursor-pointer" : ""}${selected ? " bg-primary/5" : ""}`}
            onClick={() => {
              if (detailable) onDetails?.(item);
            }}
          >
            {/* Type icon */}
            <span
              className={`shrink-0 ${TYPE_COLORS[item.type] || "text-muted-foreground"}`}
            >
              {TYPE_ICONS[item.type] || <Plug size={12} />}
            </span>

            {/* Select checkbox */}
            <input
              type="checkbox"
              checked={selected}
              disabled={!selectable}
              onChange={(e) => {
                e.stopPropagation();
                onSelect(item, e.target.checked);
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-3.5 w-3.5 rounded border border-border bg-background"
              aria-label={`Select ${item.name}`}
            />

            {/* Name + installed badge */}
            <div className="w-56 shrink-0 flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-medium truncate text-foreground" title={item.name}>{item.name}</span>
              {item.installed && (
                <Check size={10} className="text-green-500 dark:text-green-400 shrink-0" />
              )}
              {item.marketplaceRepo && (
                <Badge
                  variant="secondary"
                  className="text-micro px-1 py-0 shrink-0 hidden lg:inline-flex"
                >
                  {item.marketplaceRepo}
                </Badge>
              )}
              <Badge
                variant="outline"
                className="text-micro px-1 py-0 shrink-0 hidden xl:inline-flex"
              >
                {getMarketplaceProviderSupportLabel(item.type)}
              </Badge>
            </div>

            {/* Description */}
            <div className="flex-1 text-xs text-muted-foreground truncate hidden md:block">
              {item.description}
            </div>

            {/* Type badge */}
            <div className="w-20 text-center hidden sm:block">
              <Badge variant="outline" className="text-micro px-1.5 py-0">
                {getMarketplaceTypeLabel(item.type)}
              </Badge>
            </div>

            {/* Stars */}
            <div className="w-16 text-center hidden sm:block">
              {item.stars !== undefined && (
                <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Star size={9} />
                  {item.stars}
                </span>
              )}
            </div>

            {/* Token estimate */}
            <div className="w-24 text-center hidden md:block">
              {item.estimatedTokens ? (
                <span className="text-xs text-muted-foreground font-mono">
                  ~{item.estimatedTokens.toLocaleString()}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/50">—</span>
              )}
            </div>

            {/* Author */}
            <div className="w-20 text-right hidden lg:block">
              <span className="text-xs text-muted-foreground truncate">
                {item.author}
              </span>
            </div>

            {/* Actions */}
            <div className="w-32 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {!item.url.startsWith("builtin://") && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground/50 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                >
                  <ExternalLink size={11} />
                </a>
              )}
              {item.installed ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-micro px-2"
                  onClick={() => onUninstall(item)}
                  disabled={uninstalling}
                >
                  {uninstalling ? (
                    <Loader2 size={9} className="animate-spin" />
                  ) : (
                    <Trash2 size={9} className="mr-0.5" />
                  )}
                  Remove
                </Button>
              ) : (
                <>
                  {installableAll && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-micro px-1.5"
                      onClick={() => onInstallAll(item)}
                      disabled={installingAll || installing || !installable}
                      title={installAllTitle(item)}
                    >
                      {installingAll ? (
                        <Loader2 size={9} className="animate-spin" />
                      ) : (
                        "All"
                      )}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-micro px-2"
                    onClick={() => onInstall(item)}
                    disabled={installing || installingAll || !installable}
                    title={installDisabledReason(item)}
                  >
                    {installing ? (
                      <Loader2 size={9} className="animate-spin" />
                    ) : (
                      <Download size={9} className="mr-0.5" />
                    )}
                    {installable ? "Install" : "Unsupported"}
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PackageList({
  groups,
  loading,
  searched,
  installingName,
  installingAllName,
  uninstallingName,
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
  onDetails,
}: PackageListProps) {
  if (loading) {
    return (
      <div className="border border-border rounded-lg divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-3 animate-pulse"
          >
            <div className="h-3 w-3 bg-muted rounded-full shrink-0" />
            <div className="h-3 bg-muted rounded w-32" />
            <div className="h-3 bg-muted rounded w-48 hidden md:block" />
            <div className="flex-1" />
            <div className="h-3 bg-muted rounded w-16" />
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
        <ListTable
          items={groups[0].items}
          installingName={installingName}
          installingAllName={installingAllName}
          uninstallingName={uninstallingName}
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
            <ListTable
              items={group.items}
              installingName={installingName}
              installingAllName={installingAllName}
              uninstallingName={uninstallingName}
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
