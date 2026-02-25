"use client";

import { useState } from "react";
import {
  Search,
  GitFork,
  Package,
  Globe,
  Trash2,
  ChevronDown,
  ChevronUp,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { MarketplaceSource } from "@/types/marketplace";
import type { SecurityAnalysisResult } from "@/types/security-analysis";

const SOURCE_TYPE_META: Record<
  string,
  { icon: React.ElementType; color: string; label: string }
> = {
  github_search: { icon: Search, color: "text-amber-500", label: "Search" },
  github_org: { icon: GitFork, color: "text-blue-500 dark:text-blue-400", label: "Org" },
  github_repo: { icon: Package, color: "text-purple-500", label: "Repo" },
  registry: { icon: Globe, color: "text-green-500", label: "Registry" },
};

const RISK_COLORS: Record<string, string> = {
  low: "text-green-500",
  medium: "text-amber-500",
  high: "text-red-500",
};

const RISK_ICONS: Record<string, React.ReactNode> = {
  low: <ShieldCheck size={12} className="text-green-500" />,
  medium: <Shield size={12} className="text-amber-500" />,
  high: <ShieldAlert size={12} className="text-red-500" />,
};

function getSourceAnalysis(
  source: MarketplaceSource,
): SecurityAnalysisResult | null {
  try {
    const config =
      typeof source.config === "string"
        ? JSON.parse(source.config)
        : source.config;
    return config?.securityAnalysis || null;
  } catch {
    return null;
  }
}

function getConfigSummary(source: MarketplaceSource): string {
  try {
    const config =
      typeof source.config === "string"
        ? JSON.parse(source.config)
        : source.config;
    return config?.repo || config?.org || config?.query || config?.url || "";
  } catch {
    return "";
  }
}

interface SourceCardProps {
  source: MarketplaceSource;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  togglePending?: boolean;
  deletePending?: boolean;
}

export function SourceCard({
  source,
  onToggle,
  onDelete,
  togglePending,
  deletePending,
}: SourceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const meta =
    SOURCE_TYPE_META[source.source_type] || SOURCE_TYPE_META.registry;
  const Icon = meta.icon;
  const analysis = getSourceAnalysis(source);
  const configSummary = getConfigSummary(source);

  return (
    <div className="rounded-lg border border-border/50 bg-card transition-colors">
      <div className="flex items-start gap-3 p-3">
        {/* Type icon */}
        <div className="mt-0.5 shrink-0">
          <Icon size={16} className={meta.color} />
        </div>

        {/* Name + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{source.name}</span>
            <Badge variant="secondary" className="text-micro shrink-0">
              {meta.label}
            </Badge>
            {analysis && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="shrink-0"
                title={`Security: ${analysis.overallRisk} risk`}
              >
                {RISK_ICONS[analysis.overallRisk]}
              </button>
            )}
          </div>
          {configSummary && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {configSummary}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            checked={source.enabled}
            onCheckedChange={(checked) => onToggle(source.id, checked)}
            disabled={togglePending}
          />
          {analysis && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground hover:text-foreground p-0.5"
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(source.id)}
            disabled={deletePending}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* Expandable security findings */}
      {analysis && expanded && (
        <div className="mx-3 mb-3 p-2.5 rounded-md border border-border/30 bg-muted/30 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {RISK_ICONS[analysis.overallRisk]}
            <span className={RISK_COLORS[analysis.overallRisk] || ""}>
              {analysis.overallRisk.charAt(0).toUpperCase() +
                analysis.overallRisk.slice(1)}{" "}
              risk
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{analysis.summary}</p>
          {analysis.findings.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
              {analysis.findings.slice(0, 3).map((f, i) => (
                <li key={i}>
                  <span className={RISK_COLORS[f.severity] || ""}>
                    [{f.severity}]
                  </span>{" "}
                  {f.title}
                </li>
              ))}
              {analysis.findings.length > 3 && (
                <li className="text-muted-foreground/60">
                  +{analysis.findings.length - 3} more
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
