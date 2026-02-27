"use client";

import {
  Star,
  ExternalLink,
  Download,
  Loader2,
  Trash2,
  Plug,
  Check,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CollapsibleSection } from "@/components/tools/CollapsibleSection";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TYPE_ICONS, TYPE_COLORS } from "@/components/marketplace/PackageCard";
import {
  getMarketplaceProviderSupportLabel,
  getMarketplaceTypeLabel,
} from "@/lib/marketplace/provider-support";
import { cn } from "@/lib/utils";
import type { MarketplaceItem } from "@/types/marketplace";

type GroupedItems = { label: string; items: MarketplaceItem[] }[];
const TOKEN_HINT =
  "Estimated from repository file text length (word-count proxy). This is not runtime usage tokens.";

interface PackageListProps {
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
  onDetails?: (item: MarketplaceItem) => void;
}

function ListTable({
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
        <div
          className="w-24 text-center hidden md:block cursor-help underline decoration-dotted underline-offset-2"
          title={TOKEN_HINT}
        >
          Tokens
        </div>
        <div className="w-20 text-right hidden lg:block">Author</div>
        <div className="w-44 text-right">Action</div>
      </div>
      {items.map((item) => {
        const installing = installingName === getKey(item);
        const installingAll = installingAllName === getKey(item);
        const uninstalling = uninstallingName === getKey(item);
        const toggling = togglingName === getKey(item);
        const selectable = isSelectable(item);
        const selected = selectedKeys.has(getKey(item));
        const detailable = isDetailable(item);
        const installable = canInstall(item);
        const installableAll = canInstallAll(item);
        const installCtaVariant = "outline";
        const installActionClass =
          "border-primary/35 text-primary hover:bg-primary/10 hover:text-primary dark:border-primary/35 dark:text-primary dark:hover:bg-primary/15 font-medium";
        const installCtaClass = cn(
          "h-6 text-micro px-2",
          installable
            ? installActionClass
            : "text-muted-foreground border-border/70",
        );
        const installSplitMainClass = cn(
          "h-6 text-micro px-2 rounded-r-none border-r-0",
          installable
            ? installActionClass
            : "text-muted-foreground border-border/70",
        );
        const installSplitToggleClass = cn(
          "h-6 px-1.5 rounded-l-none border-l",
          installable
            ? "border-primary/35 text-primary hover:bg-primary/10 hover:text-primary dark:border-primary/35 dark:text-primary dark:hover:bg-primary/15"
            : "border-l-0 border-border/70 text-muted-foreground",
        );
        const toggleActionClass = cn(
          "h-6 text-micro px-2",
          item.disabled
            ? "border-emerald-500/35 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
            : "border-amber-500/35 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300",
        );
        const uninstallActionClass =
          "h-6 text-micro px-2 border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive";

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
              {item.recommended && (
                <Badge className="text-micro px-1 py-0 shrink-0 bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/15">
                  Recommended
                </Badge>
              )}
              {item.installed && (
                <Check size={10} className="text-green-500 dark:text-green-400 shrink-0" />
              )}
              {item.installed && item.disabled && (
                <Badge
                  variant="outline"
                  className="text-micro px-1 py-0 shrink-0 text-amber-500 border-amber-500/30"
                >
                  disabled
                </Badge>
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
                <span
                  className="text-xs text-muted-foreground font-mono cursor-help underline decoration-dotted underline-offset-2"
                  title={TOKEN_HINT}
                >
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
            <div className="w-44 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
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
                <>
                  {item.type === "marketplace-plugin" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className={toggleActionClass}
                      onClick={() => onToggleInstalled(item)}
                      disabled={toggling || uninstalling}
                    >
                      {toggling ? (
                        <Loader2 size={9} className="animate-spin" />
                      ) : item.disabled ? (
                        "Enable"
                      ) : (
                        "Disable"
                      )}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className={uninstallActionClass}
                    onClick={() => onUninstall(item)}
                    disabled={uninstalling || toggling}
                  >
                    {uninstalling ? (
                      <Loader2 size={9} className="animate-spin" />
                    ) : (
                      <Trash2 size={9} className="mr-0.5" />
                    )}
                    Uninstall
                  </Button>
                </>
              ) : (
                <>
                  {installableAll ? (
                    <div className="inline-flex">
                      <Button
                        variant={installCtaVariant}
                        size="sm"
                        className={installSplitMainClass}
                        onClick={() => onInstall(item)}
                        disabled={installing || installingAll || !installable}
                        title={installDisabledReason(item)}
                      >
                        {installing || installingAll ? (
                          <Loader2 size={9} className="animate-spin" />
                        ) : (
                          <Download size={9} className="mr-0.5" />
                        )}
                        {installable ? "Install" : "Unsupported"}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant={installCtaVariant}
                            size="sm"
                            className={installSplitToggleClass}
                            disabled={installing || installingAll || !installable}
                            aria-label="More install options"
                          >
                            <ChevronDown size={9} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => onInstallAll(item)}
                            disabled={installing || installingAll || !installable}
                          >
                            {installAllTitle(item) || "Install to all providers"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
                    <Button
                      variant={installCtaVariant}
                      size="sm"
                      className={installCtaClass}
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
                  )}
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
            <ListTable
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
