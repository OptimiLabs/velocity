"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Link, FileText, Loader2 } from "lucide-react";

interface SkillImporterProps {
  onClose: () => void;
  onImported: () => void;
}

export function SkillImporter({ onClose, onImported }: SkillImporterProps) {
  const [mode, setMode] = useState<"url" | "paste">("url");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const rawUrl = url
        .replace("github.com", "raw.githubusercontent.com")
        .replace(/\/blob\//, "/");
      const res = await fetch(rawUrl);
      if (!res.ok) throw new Error("Failed to fetch");
      const text = await res.text();
      setPreview(text);
      // Auto-fill name from URL
      if (!name) {
        const parts = url.split("/");
        setName(parts[parts.length - 1]?.replace(/\.md$/, "") || "skill");
      }
    } catch {
      setError("Could not fetch content from URL");
    }
    setLoading(false);
  };

  const install = async () => {
    const skillContent = mode === "url" ? preview : content;
    if (!skillContent || !name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          name: name.trim(),
          url: mode === "url" ? url : undefined,
          content: mode === "paste" ? skillContent : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Install failed");
      }
      onImported();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Install failed");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-popover border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">Import Skill</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode("url")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                mode === "url"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Link size={12} /> From URL
            </button>
            <button
              onClick={() => setMode("paste")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                mode === "paste"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <FileText size={12} /> Paste Markdown
            </button>
          </div>

          {/* Name */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Skill Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-skill"
              className="w-full h-8 text-xs font-mono rounded border border-border bg-background px-2"
            />
          </div>

          {mode === "url" ? (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium">GitHub URL</label>
                <div className="flex gap-2">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://github.com/user/repo/blob/main/SKILL.md"
                    className="flex-1 h-8 text-xs font-mono rounded border border-border bg-background px-2"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={fetchPreview}
                    disabled={loading || !url}
                  >
                    {loading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      "Preview"
                    )}
                  </Button>
                </div>
              </div>

              {preview && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Preview
                  </label>
                  <pre className="text-meta font-mono bg-muted/50 rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {preview.slice(0, 2000)}
                    {preview.length > 2000 ? "\n...(truncated)" : ""}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-1">
              <label className="text-xs font-medium">Skill Markdown</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste your skill markdown here..."
                rows={10}
                className="w-full text-xs font-mono rounded border border-border bg-background px-2 py-1.5 resize-none"
              />
            </div>
          )}

          {error && <div className="text-xs text-destructive">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={install}
            disabled={
              loading || !name.trim() || (mode === "url" ? !preview : !content)
            }
          >
            {loading ? (
              <Loader2 size={12} className="animate-spin mr-1" />
            ) : null}
            Install Skill
          </Button>
        </div>
      </div>
    </div>
  );
}
