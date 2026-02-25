"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface DisabledStorageNoteProps {
  children: ReactNode;
  className?: string;
}

export function DisabledStorageNote({
  children,
  className,
}: DisabledStorageNoteProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-border/50 bg-muted/25 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <Info size={13} className="mt-0.5 shrink-0 text-chart-2" />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
