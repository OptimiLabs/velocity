"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Download } from "lucide-react";
import {
  useFetchUrl,
  useSaveKnowledge,
  useSummarizeContent,
  useProviders,
} from "@/hooks/useInstructions";

const CATEGORIES = ["frontend", "backend", "frameworks", "workflows", "tools"];

function slugFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts.pop() || "imported";
    return last.replace(/\.(html?|htm)$/, "").replace(/[^a-zA-Z0-9_-]/g, "-");
  } catch {
    return "imported";
  }
}

interface KnowledgeImporterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KnowledgeImporter({
  open,
  onOpenChange,
}: KnowledgeImporterProps) {
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [charCount, setCharCount] = useState(0);
  const [estimatedTokens, setEstimatedTokens] = useState(0);
  const [category, setCategory] = useState("frontend");
  const [filename, setFilename] = useState("");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchUrl = useFetchUrl();
  const saveKnowledge = useSaveKnowledge();
  const summarize = useSummarizeContent();
  const { data: providers } = useProviders();

  const hasProviders =
    providers && Array.isArray(providers) && providers.length > 0;

  const handleFetch = async () => {
    setFetchError(null);
    try {
      const result = await fetchUrl.mutateAsync({ url });
      setContent(result.content);
      setCharCount(result.charCount);
      setEstimatedTokens(result.estimatedTokens);
      if (!filename) setFilename(slugFromUrl(url));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Fetch failed");
    }
  };

  const handleSummarize = async () => {
    try {
      const provider = providers?.[0]?.provider || "anthropic";
      const result = await summarize.mutateAsync({
        content,
        provider,
      });
      setContent(result.summary);
      setCharCount(result.summary.length);
      setEstimatedTokens(Math.ceil(result.summary.length / 4));
    } catch {
      // Error handled by mutation
    }
  };

  const handleImport = async () => {
    setSaveError(null);
    try {
      await saveKnowledge.mutateAsync({
        content,
        category,
        filename,
        sourceUrl: url,
      });
      // Reset & close
      setUrl("");
      setContent("");
      setFilename("");
      setCharCount(0);
      setEstimatedTokens(0);
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Knowledge from URL</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* URL input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Documentation URL</label>
            <div className="flex gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.example.com/guide"
                className="flex-1 h-9 text-sm rounded-md border border-border bg-background px-3 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={handleFetch}
                disabled={fetchUrl.isPending || !url}
              >
                {fetchUrl.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  "Fetch"
                )}
              </Button>
            </div>
            {fetchError && (
              <p className="text-xs text-destructive">{fetchError}</p>
            )}
          </div>

          {/* Preview */}
          {content && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium">Content Preview</label>
                  <span className="text-meta text-muted-foreground tabular-nums">
                    {charCount.toLocaleString()} chars &middot; ~
                    {estimatedTokens.toLocaleString()} tokens
                  </span>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    setCharCount(e.target.value.length);
                    setEstimatedTokens(Math.ceil(e.target.value.length / 4));
                  }}
                  rows={10}
                  className="w-full text-xs font-mono rounded-md border border-border bg-muted/30 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>

              {/* Summarize button */}
              {hasProviders && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSummarize}
                  disabled={summarize.isPending}
                >
                  {summarize.isPending ? (
                    <Loader2 size={14} className="animate-spin mr-1.5" />
                  ) : (
                    <Sparkles size={14} className="mr-1.5" />
                  )}
                  Summarize with AI
                </Button>
              )}

              {/* Category & filename */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full h-9 text-sm rounded-md border border-border bg-background px-2 focus:outline-none focus:ring-1 focus:ring-primary/40"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Filename</label>
                  <input
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    placeholder="my-knowledge-file"
                    className="w-full h-9 text-sm rounded-md border border-border bg-background px-3 focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <p className="text-meta text-muted-foreground">
                    Will be saved as {filename || "..."}.md
                  </p>
                </div>
              </div>

              {saveError && (
                <p className="text-xs text-destructive">{saveError}</p>
              )}

              {/* Import button */}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleImport}
                  disabled={
                    saveKnowledge.isPending || !content || !filename.trim()
                  }
                >
                  {saveKnowledge.isPending ? (
                    <Loader2 size={14} className="animate-spin mr-1.5" />
                  ) : (
                    <Download size={14} className="mr-1.5" />
                  )}
                  Import
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
