"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { X, Pin, Archive } from "lucide-react";
import type { ConsoleSession } from "@/types/console";

interface ConsoleSessionCardProps {
  session: ConsoleSession;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onRename?: (label: string) => void;
  onArchive?: () => void;
  isPinned?: boolean;
  onPin?: () => void;
  terminalCount?: number;
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-400",
  idle: "bg-muted-foreground",
};

export function ConsoleSessionCard({
  session,
  isActive,
  onSelect,
  onClose,
  onRename,
  onArchive,
  isPinned,
  onPin,
  terminalCount,
}: ConsoleSessionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(session.label);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRename) {
      setEditValue(session.label);
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== session.label) {
      onRename?.(trimmed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      setEditValue(session.label);
      setIsEditing(false);
    }
  };

  const cwdBasename = session.cwd
    .split("/")
    .filter(Boolean)
    .slice(-1)
    .join("/");

  const timeAgo = (() => {
    const ts = session.lastActivityAt ?? session.createdAt;
    const diff = Date.now() - ts;
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return "now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  })();

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-2.5 py-1 rounded-md transition-all group relative",
        "hover:bg-muted/40",
        isActive
          ? "bg-nav-active-bg border border-primary/25 shadow-[inset_2px_0_0_0] shadow-primary/60"
          : "border border-transparent",
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <div
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            statusColors[session.status],
          )}
          title={session.status === "active" ? "Running" : "Idle"}
        />
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="text-xs flex-1 leading-tight bg-background border border-primary/30 rounded px-1 py-0 outline-none focus:border-primary/60 min-w-0 font-medium"
            data-session-label
          />
        ) : (
          <span
            className={cn(
              "text-xs truncate leading-tight",
              isActive
                ? "text-foreground font-semibold"
                : "text-muted-foreground font-medium",
              onRename && "cursor-text",
            )}
            onDoubleClick={handleStartEdit}
            title={onRename ? "Double-click to rename" : session.label}
            data-session-label
          >
            {session.label}
          </span>
        )}
        <span
          className="text-[10px] font-mono text-text-tertiary truncate max-w-[80px]"
          title={session.cwd}
        >
          {cwdBasename}
        </span>
        {terminalCount != null && terminalCount > 1 && (
          <span
            className="text-[10px] font-mono text-muted-foreground/60 tabular-nums shrink-0"
            title={`${terminalCount} terminal panes`}
          >
            {terminalCount}T
          </span>
        )}
        <span
          className="text-[10px] text-text-quaternary font-mono ml-auto shrink-0"
          title={new Date(
            session.lastActivityAt ?? session.createdAt,
          ).toLocaleString()}
        >
          {timeAgo}
        </span>
        {onPin && (
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onPin();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                onPin();
              }
            }}
            className={cn(
              "p-0.5 rounded transition-opacity shrink-0",
              isPinned
                ? "opacity-100 text-primary"
                : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary",
            )}
            title={isPinned ? "Unpin from tile" : "Pin to tile"}
          >
            <Pin size={11} className={isPinned ? "fill-current" : ""} />
          </div>
        )}
        {onArchive && (
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onArchive();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                onArchive();
              }
            }}
            className="opacity-0 group-hover:opacity-70 hover:!opacity-100 p-0.5 hover:bg-muted rounded-sm transition-opacity duration-150 shrink-0"
            title="Archive session"
          >
            <Archive size={10} className="text-muted-foreground" />
          </div>
        )}
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.stopPropagation();
              onClose();
            }
          }}
          className="opacity-0 group-hover:opacity-70 hover:!opacity-100 p-0.5 hover:bg-destructive/15 rounded-sm transition-opacity duration-150 shrink-0"
          title="Close session"
        >
          <X size={10} className="text-muted-foreground" />
        </div>
      </div>
    </button>
  );
}
