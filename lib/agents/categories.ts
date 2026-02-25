import { createElement } from "react";
import {
  SearchCheck,
  Bug,
  TestTube2,
  Shield,
  Gauge,
  BookOpen,
  ArrowRightLeft,
  Bot,
  RefreshCw,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const CATEGORY_MAP: Record<
  string,
  { label: string; icon: LucideIcon; colorClass: string }
> = {
  quality: { label: "Quality", icon: SearchCheck, colorClass: "text-indigo-400" },
  debug: { label: "Debug", icon: Bug, colorClass: "text-red-400" },
  testing: { label: "Testing", icon: TestTube2, colorClass: "text-emerald-400" },
  security: { label: "Security", icon: Shield, colorClass: "text-amber-400" },
  performance: { label: "Performance", icon: Gauge, colorClass: "text-violet-400" },
  documentation: { label: "Documentation", icon: BookOpen, colorClass: "text-sky-400" },
  migration: { label: "Migration", icon: ArrowRightLeft, colorClass: "text-teal-400" },
  general: { label: "General", icon: Bot, colorClass: "text-muted-foreground" },
};

/** Maps preset icon name strings to actual Lucide components */
export const AGENT_ICON_MAP: Record<string, LucideIcon> = {
  SearchCheck,
  Bug,
  TestTube2,
  RefreshCw,
  BookOpen,
  Shield,
  Gauge,
  ArrowRightLeft,
  Bot,
};

export const DEFAULT_CATEGORY = "general";

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_MAP).map(
  ([value, { label }]) => ({ value, label }),
);

/**
 * Resolves the best icon for an agent.
 * Priority: explicit icon field > category icon > Bot fallback
 */
export function getAgentIcon(agent: {
  icon?: string;
  category?: string;
}): LucideIcon {
  if (agent.icon && AGENT_ICON_MAP[agent.icon]) {
    return AGENT_ICON_MAP[agent.icon];
  }
  const cat = agent.category || DEFAULT_CATEGORY;
  return CATEGORY_MAP[cat]?.icon ?? Bot;
}

/** Returns the agent's category, defaulting to "general" */
export function getAgentCategory(agent: { category?: string }): string {
  return agent.category || DEFAULT_CATEGORY;
}

/**
 * Returns the Tailwind text-color class for a given category.
 */
export function getCategoryColor(category?: string): string {
  return (
    CATEGORY_MAP[category || DEFAULT_CATEGORY]?.colorClass ??
    "text-muted-foreground"
  );
}

/**
 * Renders the agent's category icon as a React element.
 * Uses createElement to avoid React Compiler's "dynamic component" lint error.
 * Auto-applies the category color; pass className to override.
 */
export function AgentIcon({
  agent,
  className,
  ...props
}: { agent: { icon?: string; color?: string; category?: string } } & LucideProps) {
  const cat = agent.category || DEFAULT_CATEGORY;
  const colorClass = CATEGORY_MAP[cat]?.colorClass ?? "text-muted-foreground";

  // Explicit hex color overrides the category Tailwind class
  if (agent.color) {
    return createElement(getAgentIcon(agent), {
      className,
      style: { color: agent.color, ...props.style },
      ...props,
    });
  }

  return createElement(getAgentIcon(agent), {
    className: cn(colorClass, className),
    ...props,
  });
}
