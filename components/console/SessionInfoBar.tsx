"use client";

import { useState, useCallback } from "react";
import { Copy, Check, RotateCcw, FolderOpen } from "lucide-react";
import { DEFAULT_MODEL, MODELS } from "@/lib/console/models";

const EFFORT_LABELS: Record<string, string> = {
  low: "Lo",
  medium: "Med",
  high: "Hi",
};

interface SessionInfoBarProps {
  label: string;
  cwd: string;
  model?: string;
  effort?: "low" | "medium" | "high";
  claudeSessionId?: string;
  onModelChange?: (model: string) => void;
  onRestart?: (opts?: {
    model?: string;
    effort?: "low" | "medium" | "high";
  }) => void;
  onRename?: (label: string) => void;
}

export function SessionInfoBar({
  label,
  cwd,
  model,
  effort,
  claudeSessionId,
  onModelChange,
  onRestart,
  onRename,
}: SessionInfoBarProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(label);

  const handleCopy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  const handleSaveLabel = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== label) {
      onRename?.(trimmed);
    }
    setIsEditing(false);
  };

  const cwdShort = (() => {
    const normalized = cwd.replace(/^\/(?:Users|home)\/[^/]+/, "~");
    const parts = normalized.split("/");
    if (parts.length <= 3) return normalized;
    return `${parts[0]}/…/${parts.slice(-2).join("/")}`;
  })();

  return (
    <div className="flex items-center h-7 px-2 border-b border-border/40 bg-card/40 shrink-0 gap-2 text-xs overflow-hidden">
      {/* Session label (editable) */}
      {isEditing ? (
        <input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSaveLabel}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveLabel();
            if (e.key === "Escape") {
              setEditValue(label);
              setIsEditing(false);
            }
          }}
          autoFocus
          className="bg-background border border-primary/30 rounded px-1 py-0 text-xs outline-none focus:border-primary/60 min-w-0 w-24 font-medium"
          data-session-label
        />
      ) : (
        <span
          className="font-medium text-foreground/80 truncate max-w-[120px] cursor-text"
          onDoubleClick={() => {
            if (onRename) {
              setEditValue(label);
              setIsEditing(true);
            }
          }}
          title={`${label} (double-click to rename)`}
          data-session-label
        >
          {label}
        </span>
      )}

      {/* Separator */}
      <span className="text-border">|</span>

      {/* CWD (clickable to copy) */}
      <button
        onClick={() => handleCopy(cwd, "cwd")}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors font-mono truncate max-w-[200px]"
        title={`${cwd} (click to copy)`}
      >
        <FolderOpen className="w-3 h-3 shrink-0" />
        {cwdShort}
        {copied === "cwd" && <Check className="w-3 h-3 text-emerald-400" />}
      </button>

      {/* Resume ID (if available) */}
      {claudeSessionId && (
        <>
          <span className="text-border">|</span>
          <button
            onClick={() => handleCopy(claudeSessionId, "resume")}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors font-mono"
            title={`Resume ID: ${claudeSessionId} (click to copy)`}
          >
            {claudeSessionId.slice(0, 8)}...
            {copied === "resume" ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Model selector */}
      {onModelChange && (
        <select
          value={model || DEFAULT_MODEL}
          onChange={(e) => onModelChange(e.target.value)}
          className="h-5 text-[11px] px-1 bg-card border border-border/50 rounded text-foreground cursor-pointer"
          title="Change model (sends /model to PTY)"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      )}

      {/* Effort indicator */}
      {effort && (
        <span
          className="px-1.5 py-0 rounded bg-muted/40 text-[10px] font-medium text-muted-foreground"
          title={`Effort: ${effort}`}
        >
          {EFFORT_LABELS[effort] || effort}
        </span>
      )}

      {/* Restart button */}
      {onRestart && (
        <button
          onClick={() => onRestart()}
          className="p-0.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
          title="Restart session (kill PTY + respawn with same settings)"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
