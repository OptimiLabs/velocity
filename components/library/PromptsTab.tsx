"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PromptEditor } from "./PromptEditor";
import { Plus, FileText, Trash2 } from "lucide-react";
import type { PromptFileFrontmatter } from "@/lib/claude-md";

interface PromptFile {
  filename: string;
  frontmatter: PromptFileFrontmatter;
  content: string;
  fullPath: string;
}

export function PromptsTab() {
  const [files, setFiles] = useState<PromptFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<PromptFile | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/claude-md");
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleSave = async (
    filename: string,
    content: string,
    frontmatter: PromptFileFrontmatter,
  ) => {
    const isUpdate = selectedFile?.filename === filename;
    const url = isUpdate
      ? `/api/claude-md/${encodeURIComponent(filename)}`
      : "/api/claude-md";
    const method = isUpdate ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, content, frontmatter }),
    });

    if (res.ok) {
      setSelectedFile(null);
      setIsCreating(false);
      fetchFiles();
    }
  };

  const handleDelete = async (filename: string) => {
    const res = await fetch(`/api/claude-md/${encodeURIComponent(filename)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      if (selectedFile?.filename === filename) setSelectedFile(null);
      fetchFiles();
    } else {
      toast.error("Failed to delete file");
    }
  };

  if (isCreating || selectedFile) {
    return (
      <div className="flex-1 min-h-0 border border-border rounded-md overflow-hidden">
        <PromptEditor
          filename={selectedFile?.filename}
          initialContent={selectedFile?.content}
          initialFrontmatter={selectedFile?.frontmatter}
          onSave={handleSave}
          onClose={() => {
            setSelectedFile(null);
            setIsCreating(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setIsCreating(true)}
        >
          <Plus size={12} />
          New Prompt
        </Button>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground py-8 text-center">
          Loading...
        </div>
      ) : files.length === 0 ? (
        <Card className="bg-card">
          <CardContent className="py-12 text-center">
            <FileText
              size={24}
              className="mx-auto mb-2 text-muted-foreground"
            />
            <p className="text-sm font-medium text-foreground">
              No prompt files yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Create your first prompt to build a reusable library
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {files.map((file) => (
            <Card
              key={file.filename}
              className="bg-card card-hover-glow cursor-pointer border border-border"
              onClick={() => setSelectedFile(file)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-chart-1 shrink-0" />
                    <span className="text-sm font-semibold text-foreground truncate">
                      {file.frontmatter.name}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(file.filename);
                    }}
                    className="p-1 hover:bg-destructive/20 rounded transition-colors shrink-0"
                  >
                    <Trash2 size={12} className="text-muted-foreground" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="text-meta font-medium">
                    {file.frontmatter.category}
                  </Badge>
                  {file.frontmatter.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-meta">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {file.content.slice(0, 120) || "Empty prompt"}
                </p>
                <div className="mt-2 text-detail text-muted-foreground font-mono">
                  {file.filename}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
