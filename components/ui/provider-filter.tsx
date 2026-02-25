"use client";

import { cn } from "@/lib/utils";
import type { ConfigProvider } from "@/types/provider";
import {
  getSessionProvider,
  getAllSessionProviders,
} from "@/lib/providers/session-registry";

interface ProviderFilterProps {
  value: ConfigProvider | null;
  onChange: (provider: ConfigProvider | null) => void;
  providers?: ConfigProvider[];
  allowAll?: boolean;
  className?: string;
}

export function ProviderFilter({
  value,
  onChange,
  providers,
  allowAll = true,
  className,
}: ProviderFilterProps) {
  const list = providers ?? getAllSessionProviders().map((d) => d.id);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {allowAll && (
        <button
          onClick={() => onChange(null)}
          className={cn(
            "h-7 rounded-full border px-2.5 text-xs font-semibold tracking-[0.01em] transition-colors",
            value === null
              ? "border-border bg-background text-foreground shadow-xs"
              : "bg-muted/50 text-muted-foreground border-border/60 hover:text-foreground hover:border-border",
          )}
        >
          All
        </button>
      )}
      {list.map((p) => {
        const def = getSessionProvider(p);
        const classes = def?.badgeClasses;
        const isActive = value === p;
        return (
          <button
            key={p}
            onClick={() => onChange(allowAll && isActive ? null : p)}
            className={cn(
              "h-7 rounded-full border px-2.5 text-xs font-semibold tracking-[0.01em] transition-colors",
              isActive && classes
                ? cn(classes.bg, classes.text, classes.border)
                : "bg-muted/50 text-muted-foreground border-border/60 hover:text-foreground hover:border-border",
            )}
          >
            {def?.label ?? p}
          </button>
        );
      })}
    </div>
  );
}
