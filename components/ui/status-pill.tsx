"use client";

import type { MouseEventHandler, ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusPillProps {
  enabled: boolean;
  onToggle?: () => void;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  enabledLabel?: string;
  disabledLabel?: string;
  enabledIcon?: ReactNode;
  disabledIcon?: ReactNode;
  className?: string;
  title?: string;
}

export function StatusPill({
  enabled,
  onToggle,
  onClick,
  enabledLabel = "Enabled",
  disabledLabel = "Disabled",
  enabledIcon = <Eye size={9} />,
  disabledIcon = <EyeOff size={9} />,
  className,
  title,
}: StatusPillProps) {
  const shared = cn(
    "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
    enabled
      ? "border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
      : "border-muted-foreground/30 text-muted-foreground hover:bg-muted/50",
    className,
  );

  if (!onToggle) {
    return (
      <span className={shared} title={title}>
        {enabled ? enabledIcon : disabledIcon}
        {enabled ? enabledLabel : disabledLabel}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        onToggle();
      }}
      className={shared}
      title={title}
    >
      {enabled ? enabledIcon : disabledIcon}
      {enabled ? enabledLabel : disabledLabel}
    </button>
  );
}
