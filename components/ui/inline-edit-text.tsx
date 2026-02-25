"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlineEditTextProps {
  value: string;
  onSave: (name: string) => void;
  className?: string;
}

export function InlineEditText({
  value,
  onSave,
  className,
}: InlineEditTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
    setEditing(false);
  }, [draft, value, onSave]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={cn(
          "text-sm font-medium bg-transparent border-b border-primary/40 outline-none flex-1 min-w-0 px-0 py-0",
          className,
        )}
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        "text-sm font-medium truncate flex items-center gap-1.5 group hover:text-primary transition-colors min-w-0",
        className,
      )}
    >
      <span className="truncate">{value}</span>
      <Pencil
        size={10}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground"
      />
    </button>
  );
}
