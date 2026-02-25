"use client";

import {
  Star,
  ExternalLink,
  Download,
  Loader2,
  Trash2,
  Server,
  Zap,
  FileText,
  Plug,
  Check,
  Activity,
  Blocks,
  Workflow,
  Bot,
  HelpCircle,
  Eye,
  EyeOff,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getMarketplaceProviderSupportLabel,
  getMarketplaceTypeLabel,
} from "@/lib/marketplace/provider-support";
import { cn } from "@/lib/utils";
import type { MarketplaceItem } from "@/types/marketplace";

export const TYPE_ICONS: Record<string, React.ReactNode> = {
  "mcp-server": <Server size={14} />,
  hook: <Zap size={14} />,
  skill: <FileText size={14} />,
  plugin: <Plug size={14} />,
  "marketplace-plugin": <Blocks size={14} />,
  statusline: <Activity size={14} />,
  unclassified: <HelpCircle size={14} />,
  agent: <Bot size={14} />,
};

export const TYPE_COLORS: Record<string, string> = {
  "mcp-server": "text-blue-500 dark:text-blue-400",
  hook: "text-yellow-500 dark:text-yellow-400",
  skill: "text-green-500 dark:text-green-400",
  plugin: "text-purple-500 dark:text-purple-400",
  "marketplace-plugin": "text-chart-4",
  statusline: "text-cyan-500 dark:text-cyan-400",
  unclassified: "text-muted-foreground",
  agent: "text-violet-500 dark:text-violet-400",
};

interface PackageCardProps {
  item: MarketplaceItem;
  recommended?: boolean;
  installing: boolean;
  installingAll?: boolean;
  uninstalling: boolean;
  toggling?: boolean;
  selected?: boolean;
  selectable?: boolean;
  onSelectChange?: (selected: boolean) => void;
  installDisabled?: boolean;
  canInstallAll?: boolean;
  installAllLabel?: string;
  installDisabledReason?: string;
  onInstall: () => void;
  onInstallAll?: () => void;
  onUninstall: () => void;
  onToggleInstalled?: () => void;
  onDetails?: () => void;
}

export function PackageCard({
  item,
  recommended,
  installing,
  installingAll = false,
  uninstalling,
  toggling = false,
  selected = false,
  selectable = false,
  onSelectChange,
  installDisabled = false,
  canInstallAll = false,
  installAllLabel,
  installDisabledReason,
  onInstall,
  onInstallAll,
  onUninstall,
  onToggleInstalled,
  onDetails,
}: PackageCardProps) {
  const installCtaVariant = "outline";
  const installActionClass =
    "border-primary/35 text-primary hover:bg-primary/10 hover:text-primary dark:border-primary/35 dark:text-primary dark:hover:bg-primary/15 font-medium";
  const installCtaClass = cn(
    "h-6 text-micro px-2",
    installDisabled
      ? "text-muted-foreground border-border/70"
      : installActionClass,
  );
  const installSplitMainClass = cn(
    "h-6 text-micro px-2 rounded-r-none border-r-0",
    installDisabled
      ? "text-muted-foreground border-border/70"
      : installActionClass,
  );
  const installSplitToggleClass = cn(
    "h-6 px-1.5 rounded-l-none border-l",
    installDisabled
      ? "border-l-0 text-muted-foreground border-border/70"
      : "border-primary/35 text-primary hover:bg-primary/10 hover:text-primary dark:border-primary/35 dark:text-primary dark:hover:bg-primary/15",
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
      className={`border border-border rounded-lg p-4 flex h-full flex-col gap-2.5 hover:border-primary/30 transition-colors${onDetails ? " cursor-pointer" : ""}${selected ? " border-primary/40 bg-primary/5" : ""}`}
      onClick={onDetails}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => {
                e.stopPropagation();
                onSelectChange?.(e.target.checked);
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-3.5 w-3.5 rounded border border-border bg-background"
              aria-label={`Select ${item.name}`}
            />
          )}
          <span className={TYPE_COLORS[item.type] || "text-muted-foreground"}>
            {item.type === "marketplace-plugin"
              ? item.category === "workflows"
                ? <Workflow size={14} />
                : (item.components?.agents ?? 0) > 1
                  ? <Blocks size={14} />
                  : <Bot size={14} />
              : (TYPE_ICONS[item.type] || <Plug size={14} />)}
          </span>
          <span className="text-sm font-medium break-all text-foreground">
            {item.type === "marketplace-plugin" && item.marketplaceRepo
              ? `${item.marketplaceRepo.split("/")[0]}:${item.name}`
              : item.name}
          </span>
          {recommended && (
            <Badge className="text-meta bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/15">
              Recommended
            </Badge>
          )}
          {item.installed && (
            <span className="flex items-center gap-0.5 text-meta text-green-500 dark:text-green-400">
              <Check size={10} />
              Installed
            </span>
          )}
          {item.installed && item.disabled && (
            <span className="flex items-center gap-0.5 text-meta text-amber-500 dark:text-amber-400">
              <EyeOff size={10} />
              Disabled
            </span>
          )}
        </div>
        {(item.stars !== undefined || !item.url.startsWith("builtin://")) && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            {item.stars !== undefined && (
              <span className="inline-flex items-center gap-1">
                <Star size={10} />
                {item.stars}
              </span>
            )}
            {!item.url.startsWith("builtin://") && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="h-5 w-5 text-muted-foreground/70 hover:text-foreground"
                asChild
              >
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Open ${item.name} on GitHub`}
                >
                  <ExternalLink size={10} />
                </a>
              </Button>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2">
        {item.description}
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-meta">
          {getMarketplaceTypeLabel(item.type)}
        </Badge>
        <Badge variant="outline" className="text-meta">
          {getMarketplaceProviderSupportLabel(item.type)}
        </Badge>
        {item.category && (
          <Badge
            variant="outline"
            className={
              item.category === "workflows"
                ? "text-meta text-amber-500 dark:text-amber-400 border-amber-500/30"
                : "text-meta text-muted-foreground"
            }
          >
            {item.category === "workflows" ? "workflow" : item.category}
          </Badge>
        )}
        {item.components ? (
          <>
            {item.components.agents > 0 && (
              <Badge variant="outline" className="text-meta text-chart-2 border-chart-2/30">
                {item.components.agents} agent{item.components.agents !== 1 ? "s" : ""}
              </Badge>
            )}
            {item.components.skills > 0 && (
              <Badge variant="outline" className="text-meta text-chart-5 border-chart-5/30">
                {item.components.skills} skill{item.components.skills !== 1 ? "s" : ""}
              </Badge>
            )}
            {item.components.commands > 0 && (
              <Badge variant="outline" className="text-meta text-chart-3 border-chart-3/30">
                {item.components.commands} cmd{item.components.commands !== 1 ? "s" : ""}
              </Badge>
            )}
          </>
        ) : item.type !== "marketplace-plugin" ? (
          <Badge variant="outline" className="text-meta">
            {item.type}
          </Badge>
        ) : null}
        {item.estimatedTokens ? (
          <Badge variant="outline" className="text-meta font-mono">
            ~{item.estimatedTokens.toLocaleString()} tok
          </Badge>
        ) : null}
        <span className="text-meta text-muted-foreground">
          by {item.author}
        </span>
      </div>
      <div className="mt-auto flex items-center justify-end gap-1.5">
        {item.installed ? (
          <div className="flex items-center gap-1">
            {item.type === "marketplace-plugin" && onToggleInstalled && (
              <Button
                variant="outline"
                size="sm"
                className={toggleActionClass}
                onClick={(e) => { e.stopPropagation(); onToggleInstalled(); }}
                disabled={toggling || uninstalling}
              >
                {toggling ? (
                  <Loader2 size={10} className="animate-spin mr-1" />
                ) : item.disabled ? (
                  <Eye size={10} className="mr-1" />
                ) : (
                  <EyeOff size={10} className="mr-1" />
                )}
                {item.disabled ? "Enable" : "Disable"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className={uninstallActionClass}
              onClick={(e) => { e.stopPropagation(); onUninstall(); }}
              disabled={uninstalling || toggling}
            >
              {uninstalling ? (
                <Loader2 size={10} className="animate-spin mr-1" />
              ) : (
                <Trash2 size={10} className="mr-1" />
              )}
              Uninstall
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {canInstallAll && onInstallAll ? (
              <div className="inline-flex">
                <Button
                  variant={installCtaVariant}
                  size="sm"
                  className={installSplitMainClass}
                  onClick={(e) => {
                    e.stopPropagation();
                    onInstall();
                  }}
                  disabled={installing || installingAll || installDisabled}
                  title={installDisabledReason}
                >
                  {installing || installingAll ? (
                    <Loader2 size={10} className="animate-spin mr-1" />
                  ) : (
                    <Download size={10} className="mr-1" />
                  )}
                  {installDisabled ? "Unsupported" : "Install"}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={installCtaVariant}
                      size="sm"
                      className={installSplitToggleClass}
                      disabled={installing || installingAll || installDisabled}
                      aria-label="More install options"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ChevronDown size={10} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem
                      onClick={() => onInstallAll()}
                      disabled={installing || installingAll || installDisabled}
                    >
                      {installAllLabel || "Install to all providers"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <Button
                variant={installCtaVariant}
                size="sm"
                className={installCtaClass}
                onClick={(e) => { e.stopPropagation(); onInstall(); }}
                disabled={installing || installingAll || installDisabled}
                title={installDisabledReason}
              >
                {installing ? (
                  <Loader2 size={10} className="animate-spin mr-1" />
                ) : (
                  <Download size={10} className="mr-1" />
                )}
                {installDisabled ? "Unsupported" : "Install"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
