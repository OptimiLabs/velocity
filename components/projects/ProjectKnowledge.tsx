"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useConfirm } from "@/hooks/useConfirm";
import {
  useInstructions,
  useDeleteInstruction,
  useUpdateInstruction,
  useCreateProjectFile,
} from "@/hooks/useInstructions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ChevronDown,
  FileText,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  InstructionFile,
  InstructionFileType,
} from "@/types/instructions";

interface ProjectKnowledgeProps {
  projectId: string;
  projectPath: string;
}

const FILE_TYPE_META: Record<string, { label: string; description: string }> = {
  "CLAUDE.md": { label: "CLAUDE.md", description: "Project instructions" },
  "agents.md": { label: "Agents", description: "Agent definitions" },
  "skill.md": { label: "Skills", description: "Slash commands" },
  "knowledge.md": { label: "Knowledge", description: "Reference docs" },
  "other.md": { label: "Other", description: "Other config files" },
};

const FILE_TYPE_ORDER: InstructionFileType[] = [
  "CLAUDE.md",
  "agents.md",
  "skill.md",
  "knowledge.md",
  "other.md",
];

export function ProjectKnowledge({
  projectId,
  projectPath,
}: ProjectKnowledgeProps) {
  const { confirm } = useConfirm();
  const { data: files = [], isLoading } = useInstructions({ projectId });
  const deleteInstruction = useDeleteInstruction();
  const updateInstruction = useUpdateInstruction();
  const createProjectFile = useCreateProjectFile();

  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [inlineCreateType, setInlineCreateType] = useState<string | null>(null);
  const [inlineFilename, setInlineFilename] = useState("");
  const inlineInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inlineCreateType && inlineInputRef.current) {
      inlineInputRef.current.focus();
    }
  }, [inlineCreateType]);

  const grouped = useMemo(() => {
    const result: Record<string, InstructionFile[]> = {};
    for (const f of files) {
      const type = f.fileType || "other.md";
      if (!result[type]) result[type] = [];
      result[type].push(f);
    }
    return result;
  }, [files]);

  const toggleType = (type: string) => {
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleStartEdit = (file: InstructionFile) => {
    setEditingId(file.id);
    setEditContent(file.content || "");
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    updateInstruction.mutate({ id: editingId, data: { content: editContent } });
    setEditingId(null);
    setEditContent("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete file?",
      description: "This will also remove it from disk.",
    });
    if (ok) {
      deleteInstruction.mutate(id);
    }
  };

  const handleCreate = (fileType: string, filename: string) => {
    createProjectFile.mutate({
      projectId,
      projectPath,
      fileType: fileType as InstructionFileType,
      filename,
      content: "",
    });
  };

  const handleCreateClaudeMd = () => {
    createProjectFile.mutate({
      projectId,
      projectPath,
      fileType: "CLAUDE.md",
      filename: "CLAUDE.md",
      content: `# ${projectPath.split("/").pop()} — Project Guidelines\n\n`,
    });
  };

  const typesWithFiles = FILE_TYPE_ORDER.filter((t) => grouped[t]?.length);
  const typesWithoutFiles = FILE_TYPE_ORDER.filter((t) => !grouped[t]?.length);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No instruction files found"
        description="Create a CLAUDE.md or other instruction files for this project."
        action={
          <Button size="sm" onClick={handleCreateClaudeMd}>
            <Plus size={14} className="mr-1.5" />
            Create CLAUDE.md
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {typesWithFiles.map((fileType) => {
        const meta = FILE_TYPE_META[fileType] || {
          label: fileType,
          description: "",
        };
        const typeFiles = grouped[fileType] || [];
        const isCollapsed = collapsedTypes.has(fileType);

        return (
          <div key={fileType}>
            <div className="flex items-center gap-2 mb-2 group/type">
              <button
                onClick={() => toggleType(fileType)}
                className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown
                  size={12}
                  className={cn(
                    "transition-transform",
                    isCollapsed && "-rotate-90",
                  )}
                />
                {meta.label}
                <span className="text-muted-foreground/50 tabular-nums">
                  {typeFiles.length}
                </span>
              </button>
              <button
                onClick={() => {
                  setInlineCreateType(fileType);
                  setInlineFilename("");
                }}
                className="opacity-0 group-hover/type:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground transition-all"
                title={`New ${meta.label} file`}
              >
                <Plus size={12} />
              </button>
            </div>

            {inlineCreateType === fileType && (
              <div className="mb-2">
                <input
                  ref={inlineInputRef}
                  value={inlineFilename}
                  onChange={(e) => setInlineFilename(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && inlineFilename.trim()) {
                      handleCreate(fileType, inlineFilename.trim());
                      setInlineCreateType(null);
                      setInlineFilename("");
                    }
                    if (e.key === "Escape") {
                      setInlineCreateType(null);
                      setInlineFilename("");
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      setInlineCreateType(null);
                      setInlineFilename("");
                    }, 150);
                  }}
                  placeholder="filename.md"
                  className="w-full max-w-xs text-xs bg-muted/50 border border-border/50 rounded px-2 py-1.5 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            )}

            {!isCollapsed && (
              <div className="space-y-2">
                {typeFiles.map((file) => (
                  <Card key={file.id} className="bg-card">
                    <CardContent className="p-3">
                      {editingId === file.id ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">
                              {file.fileName}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={handleSaveEdit}
                              >
                                <Check size={12} className="text-green-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={handleCancelEdit}
                              >
                                <X size={12} />
                              </Button>
                            </div>
                          </div>
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full min-h-[120px] text-xs font-mono bg-muted/30 border border-border/50 rounded p-2 resize-y focus:outline-none focus:ring-1 focus:ring-primary/50"
                          />
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <FileText
                            size={14}
                            className="text-muted-foreground mt-0.5 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium truncate">
                                {file.fileName}
                              </span>
                              {file.tokenCount > 0 && (
                                <span className="text-meta">
                                  ~{file.tokenCount} tok
                                </span>
                              )}
                            </div>
                            <p className="text-micro font-mono text-muted-foreground/50 truncate mt-0.5">
                              {file.filePath}
                            </p>
                            {file.content && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {file.content.slice(0, 200)}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => handleStartEdit(file)}
                            >
                              <Pencil size={11} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(file.id)}
                            >
                              <Trash2 size={11} />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {typesWithoutFiles.length > 0 && (
        <div className="border-t border-border/30 pt-4 space-y-2">
          <div className="text-micro uppercase tracking-wider text-text-tertiary font-medium">
            Create
          </div>
          <div className="flex flex-wrap gap-2">
            {typesWithoutFiles.map((fileType) => {
              const meta = FILE_TYPE_META[fileType] || {
                label: fileType,
                description: "",
              };
              return (
                <button
                  key={fileType}
                  onClick={() => {
                    if (fileType === "CLAUDE.md") {
                      handleCreateClaudeMd();
                    } else {
                      setInlineCreateType(fileType);
                      setInlineFilename("");
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-dashed border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                >
                  <Plus size={11} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
