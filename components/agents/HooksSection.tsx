"use client";

import { useState, useMemo } from "react";
import { Anchor, Plus, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { HookConfig } from "@/components/settings/HookEditor";
import {
  getRelevantHooks,
  getPrefilledMatcher,
  type HookMatch,
  type RawHooks,
} from "@/lib/hooks/matcher";

// ─── Types ──────────────────────────────────────────────────────────

interface HooksSectionProps {
  entityType: "skill" | "agent" | "workflow";
  entityName: string;
  hooks: RawHooks;
  onEditHook: (
    event: string,
    hook: HookConfig,
    ruleIndex: number,
    hookIndex: number,
  ) => void;
  onAddHook: (prefilledEvent?: string, prefilledMatcher?: string) => void;
}

// ─── Hook Row ───────────────────────────────────────────────────────

function HookRow({
  match,
  onClick,
}: {
  match: HookMatch;
  onClick: () => void;
}) {
  const { event, rule, hook } = match;
  const preview =
    hook.type === "command" ? hook.command : (hook.prompt?.slice(0, 80) ?? "");
  const matcherLabel = rule.matcher;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors group"
    >
      <Badge variant="outline" className="text-micro px-1.5 py-0 h-4 shrink-0">
        {event}
      </Badge>
      <Badge
        variant="secondary"
        className="text-micro px-1.5 py-0 h-4 shrink-0"
      >
        {hook.type}
      </Badge>
      {matcherLabel && (
        <Badge
          variant="outline"
          className="text-micro px-1.5 py-0 h-4 shrink-0 border-dashed"
        >
          {matcherLabel}
        </Badge>
      )}
      <span className="text-micro text-muted-foreground truncate flex-1 font-mono group-hover:text-foreground transition-colors">
        {preview}
      </span>
    </button>
  );
}

// ─── Collapsed Group ────────────────────────────────────────────────

function CollapsedGroup({
  label,
  matches,
  onClickHook,
}: {
  label: string;
  matches: HookMatch[];
  onClickHook: (match: HookMatch) => void;
}) {
  const [open, setOpen] = useState(false);

  if (matches.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-micro text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <ChevronRight
          size={10}
          className={cn(
            "transition-transform duration-150",
            open && "rotate-90",
          )}
        />
        <span>
          {matches.length} {label} hook{matches.length !== 1 ? "s" : ""}
        </span>
      </button>
      {open && (
        <div className="ml-2 space-y-0.5">
          {matches.map((m, i) => (
            <HookRow key={i} match={m} onClick={() => onClickHook(m)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── HooksSection ───────────────────────────────────────────────────

export function HooksSection({
  entityType,
  entityName,
  hooks,
  onEditHook,
  onAddHook,
}: HooksSectionProps) {
  const grouped = useMemo(
    () => getRelevantHooks(entityType, hooks),
    [entityType, hooks],
  );

  const totalCount =
    grouped.direct.length + grouped.lifecycle.length + grouped.global.length;

  const handleClickHook = (match: HookMatch) => {
    // Find the rule index and hook index within that rule
    const eventRules = hooks[match.event] || [];
    const ruleIndex = eventRules.indexOf(match.rule);
    if (ruleIndex < 0) return;
    const hookIndex = match.rule.hooks.indexOf(match.hook);
    if (hookIndex < 0) return;
    onEditHook(match.event, match.hook, ruleIndex, hookIndex);
  };

  const handleAddHook = () => {
    const matcher = getPrefilledMatcher(entityType);
    onAddHook("PostToolUse", matcher);
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Anchor size={11} className="text-muted-foreground" />
        <span className="text-micro font-medium text-muted-foreground uppercase tracking-wider flex-1">
          Hooks
        </span>
        <button
          onClick={handleAddHook}
          className="flex items-center gap-0.5 text-micro text-muted-foreground hover:text-foreground transition-colors"
          title={`Add hook for ${entityName}`}
        >
          <Plus size={10} />
          Add Hook
        </button>
      </div>

      {totalCount === 0 ? (
        <p className="text-micro text-muted-foreground/60 pl-0.5">
          No hooks configured for this {entityType}
        </p>
      ) : (
        <div className="space-y-1">
          {/* Direct hooks — always expanded */}
          {grouped.direct.length > 0 && (
            <div className="space-y-0.5">
              {grouped.direct.map((m, i) => (
                <HookRow
                  key={`direct-${i}`}
                  match={m}
                  onClick={() => handleClickHook(m)}
                />
              ))}
            </div>
          )}

          {/* Lifecycle + Global — collapsed with count */}
          <CollapsedGroup
            label="lifecycle"
            matches={grouped.lifecycle}
            onClickHook={handleClickHook}
          />
          <CollapsedGroup
            label="global"
            matches={grouped.global}
            onClickHook={handleClickHook}
          />
        </div>
      )}
    </div>
  );
}
