"use client";

import { useState, useEffect } from "react";
import { X, Save, FileText, Tag, ToggleLeft, ToggleRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpdateInstruction } from "@/hooks/useInstructions";
import type { InstructionFile } from "@/types/instructions";

interface KnowledgeEditorProps {
  file: InstructionFile;
  onClose: () => void;
}

export function KnowledgeEditor({ file, onClose }: KnowledgeEditorProps) {
  const [content, setContent] = useState(file.content);
  const [tags, setTags] = useState(file.tags.join(", "));
  const [isActive, setIsActive] = useState(file.isActive);
  const [description, setDescription] = useState(file.description);
  const update = useUpdateInstruction();

  useEffect(() => {
    setContent(file.content);
    setTags(file.tags.join(", "));
    setIsActive(file.isActive);
    setDescription(file.description);
  }, [file]);

  const isDirty =
    content !== file.content ||
    tags !== file.tags.join(", ") ||
    isActive !== file.isActive ||
    description !== file.description;

  const tokenCount = Math.ceil(content.length / 4);

  function handleSave() {
    const parsedTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    update.mutate(
      {
        id: file.id,
        data: { content, tags: parsedTags, isActive, description },
      },
      { onSuccess: onClose },
    );
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) handleSave();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-3 min-w-0">
            <FileText size={16} className="text-primary shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-medium truncate">
                {file.title ?? file.fileName}
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                {file.filePath}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs tabular-nums px-2 py-0.5 rounded",
                tokenCount > 1000
                  ? "bg-yellow-500/10 dark:bg-yellow-900/20 text-yellow-500 dark:text-yellow-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              ~{tokenCount} LLM tokens
            </span>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {file.category ?? ""}
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 p-4 text-sm font-mono bg-transparent resize-none focus:outline-none leading-relaxed min-h-[300px]"
            spellCheck={false}
          />

          <div className="border-t border-border/50 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground shrink-0 w-20">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description..."
                className="flex-1 text-xs bg-muted/50 border border-border/50 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground shrink-0 w-20 flex items-center gap-1">
                <Tag size={10} /> Tags
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Comma-separated tags..."
                className="flex-1 text-xs bg-muted/50 border border-border/50 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <div className="flex items-center gap-2">
              <label
                className="text-xs text-muted-foreground shrink-0 w-20"
                title="When disabled, Claude won't load this file even if the task matches"
              >
                Active
              </label>
              <button
                onClick={() => setIsActive(!isActive)}
                className="flex items-center gap-1 text-xs"
              >
                {isActive ? (
                  <ToggleRight size={18} className="text-primary" />
                ) : (
                  <ToggleLeft size={18} className="text-muted-foreground" />
                )}
                <span
                  className={cn(
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {isActive
                    ? "Claude will load this file"
                    : "Claude will skip this file"}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 border-t border-border/50">
          <div className="text-xs text-muted-foreground">
            {isDirty ? "Unsaved changes" : "No changes"} &middot;{" "}
            {content.length} chars
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isDirty || update.isPending}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors",
                isDirty
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              <Save size={12} />
              {update.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
