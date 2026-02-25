"use client";

import {
  Sparkles,
  Bot,
  Globe,
  Network,
  HardDrive,
  CheckCircle2,
  Circle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  ProviderSlug,
  ProviderCatalogEntry,
} from "@/lib/providers/catalog";

const ICON_MAP: Record<string, LucideIcon> = {
  Sparkles,
  Bot,
  Globe,
  Network,
  HardDrive,
};

const SLUG_COLORS: Record<
  ProviderSlug,
  { bg: string; text: string; border: string; glow: string }
> = {
  anthropic: {
    bg: "bg-orange-500/15",
    text: "text-orange-500 dark:text-orange-400",
    border: "border-orange-500/25",
    glow: "shadow-orange-500/10",
  },
  openai: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-500 dark:text-emerald-400",
    border: "border-emerald-500/25",
    glow: "shadow-emerald-500/10",
  },
  google: {
    bg: "bg-blue-500/15",
    text: "text-blue-500 dark:text-blue-400",
    border: "border-blue-500/25",
    glow: "shadow-blue-500/10",
  },
  openrouter: {
    bg: "bg-purple-500/15",
    text: "text-purple-500 dark:text-purple-400",
    border: "border-purple-500/25",
    glow: "shadow-purple-500/10",
  },
  local: {
    bg: "bg-zinc-500/15",
    text: "text-zinc-500 dark:text-zinc-400",
    border: "border-zinc-500/25",
    glow: "shadow-zinc-500/10",
  },
};

interface ProviderCardProps {
  entry: ProviderCatalogEntry;
  connected: boolean;
  onClick: () => void;
}

export function ProviderCard({ entry, connected, onClick }: ProviderCardProps) {
  const Icon = ICON_MAP[entry.iconName] ?? Sparkles;
  const colors = SLUG_COLORS[entry.slug];

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md group",
        connected && `shadow-sm ${colors.glow}`,
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div
            className={cn(
              "flex items-center justify-center w-9 h-9 rounded-lg",
              colors.bg,
              colors.border,
              "border",
            )}
          >
            <Icon size={18} className={colors.text} />
          </div>
          {connected ? (
            <Badge
              variant="outline"
              className="gap-1 text-xs bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/25"
            >
              <CheckCircle2 size={10} />
              Connected
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 text-xs text-text-tertiary border-border"
            >
              <Circle size={10} />
              Not set up
            </Badge>
          )}
        </div>

        {/* Name + description */}
        <div>
          <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {entry.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {entry.description}
          </p>
        </div>

        {/* Model count */}
        <div className="text-xs text-text-tertiary tabular-nums">
          {entry.models.length} model{entry.models.length !== 1 ? "s" : ""}{" "}
          available
        </div>
      </CardContent>
    </Card>
  );
}
