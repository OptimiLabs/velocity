"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SettingsFooterProps {
  isDirty: boolean;
  isSaving?: boolean;
  onReset: () => void;
  onSave: () => void;
  saveLabel?: string;
  savedLabel?: string;
  hint?: string;
  warning?: string;
  className?: string;
}

export function SettingsFooter({
  isDirty,
  isSaving = false,
  onReset,
  onSave,
  saveLabel = "Save Changes",
  savedLabel = "All changes saved",
  hint,
  warning,
  className,
}: SettingsFooterProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {warning ? (
          <Badge variant="warning">{warning}</Badge>
        ) : isDirty ? (
          <Badge variant="warning">Unsaved changes</Badge>
        ) : (
          <Badge variant="outline">{savedLabel}</Badge>
        )}
        {hint && (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!isDirty || isSaving}
          onClick={onReset}
        >
          Reset
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!isDirty || isSaving}
          onClick={onSave}
        >
          {isSaving ? "Saving..." : saveLabel}
        </Button>
      </div>
    </div>
  );
}

