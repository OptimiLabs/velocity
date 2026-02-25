"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Save, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PromptFileFrontmatter } from "@/lib/claude-md";

interface PromptFile {
  filename: string;
  frontmatter: PromptFileFrontmatter;
  content: string;
  fullPath: string;
}

interface PromptDetailViewProps {
  filename: string;
}

export function PromptDetailView({ filename }: PromptDetailViewProps) {
  const [file, setFile] = useState<PromptFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/claude-md/${encodeURIComponent(filename)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setFile(data);
        if (data) setEditContent(data.content);
      })
      .catch((err) => console.debug('[AGENTS]', err.message))
      .finally(() => setLoading(false));
  }, [filename]);

  const handleSave = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/claude-md/${encodeURIComponent(filename)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename,
            content: editContent,
            frontmatter: file.frontmatter,
          }),
        },
      );
      if (!res.ok) throw new Error();
      toast.success("Prompt saved");
      setFile({ ...file, content: editContent });
      setEditing(false);
    } catch {
      toast.error("Failed to save prompt");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!file) {
    return (
      <div className="p-4 text-xs text-muted-foreground/50">
        Prompt not found
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Metadata */}
      <div className="flex flex-wrap gap-1.5">
        {file.frontmatter?.category && (
          <Badge variant="secondary" className="text-micro">
            {file.frontmatter.category}
          </Badge>
        )}
        {file.frontmatter?.tags?.map((tag) => (
          <Badge key={tag} variant="outline" className="text-micro">
            {tag}
          </Badge>
        ))}
      </div>

      {/* Content */}
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[300px] resize-y text-xs font-mono"
          />
          <div className="flex justify-end gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => setEditing(false)}
            >
              <X size={10} />
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <Save size={10} />
              )}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <pre className="text-xs text-muted-foreground/70 font-mono bg-muted/20 rounded p-3 whitespace-pre-wrap max-h-[400px] overflow-y-auto">
            {file.content}
          </pre>
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setEditing(true)}
            >
              <Pencil size={10} />
              Edit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
