"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Save, X } from "lucide-react";
import type { PromptFileFrontmatter } from "@/lib/claude-md";

interface PromptEditorProps {
  filename?: string;
  initialContent?: string;
  initialFrontmatter?: PromptFileFrontmatter;
  onSave: (
    filename: string,
    content: string,
    frontmatter: PromptFileFrontmatter,
  ) => Promise<void>;
  onClose: () => void;
}

const CATEGORIES = [
  { value: "pre-prompt", label: "Pre-Prompt" },
  { value: "post-prompt", label: "Post-Prompt" },
  { value: "claude-md", label: "Claude.md" },
  { value: "general", label: "General" },
] as const;

export function PromptEditor({
  filename,
  initialContent,
  initialFrontmatter,
  onSave,
  onClose,
}: PromptEditorProps) {
  const [name, setName] = useState(initialFrontmatter?.name || "");
  const [category, setCategory] = useState<PromptFileFrontmatter["category"]>(
    initialFrontmatter?.category || "general",
  );
  const [tags, setTags] = useState(initialFrontmatter?.tags?.join(", ") || "");
  const [content, setContent] = useState(initialContent || "");
  const [saving, setSaving] = useState(false);

  const isNew = !filename;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const fn =
        filename || `${name.trim().toLowerCase().replace(/\s+/g, "-")}.md`;
      await onSave(fn, content, {
        name: name.trim(),
        category,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {isNew ? "New Prompt" : filename}
          </span>
          <Badge variant="secondary" className="text-meta font-medium">
            {category}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onClose}
          >
            <X size={12} />
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleSave}
            disabled={!name.trim() || saving}
          >
            <Save size={12} />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-3 border-b border-border">
        <div className="grid grid-cols-3 gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Prompt name"
            className="h-8 text-xs"
          />
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as PromptFileFrontmatter["category"])
            }
            className="h-8 text-xs px-2 bg-card border border-border rounded-md text-foreground"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags (comma-separated)"
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 p-0">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your prompt content in markdown..."
          className="w-full h-full resize-none bg-transparent p-4 text-sm font-mono leading-relaxed focus:outline-none text-foreground"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
