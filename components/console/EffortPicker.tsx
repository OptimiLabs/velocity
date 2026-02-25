"use client";

import { cn } from "@/lib/utils";

export type EffortLevel = "low" | "medium" | "high";

const EFFORT_OPTIONS: {
  value: EffortLevel | undefined;
  label: string;
  description: string;
}[] = [
  { value: undefined, label: "Auto", description: "High effort (default)" },
  { value: "low", label: "Low", description: "Fast, minimal thinking" },
  { value: "medium", label: "Medium", description: "Balanced speed & depth" },
  { value: "high", label: "High", description: "Deep reasoning" },
];

interface EffortPickerProps {
  value?: EffortLevel;
  onChange: (effort: EffortLevel | undefined) => void;
  className?: string;
}

export function EffortPicker({
  value,
  onChange,
  className,
}: EffortPickerProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border border-border p-0.5",
        className,
      )}
    >
      {EFFORT_OPTIONS.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.label}
            onClick={() => onChange(opt.value)}
            title={opt.description}
            className={cn(
              "px-1.5 py-1 text-xs rounded transition-colors whitespace-nowrap",
              isActive
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
