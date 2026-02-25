"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Trash2,
  Link,
  Lock,
  CheckSquare,
  Square,
} from "lucide-react";
import type { InstructionFile } from "@/types/instructions";

const FILE_TYPE_COLORS: Record<string, string> = {
  "CLAUDE.md": "text-chart-1",
  "agents.md": "text-chart-2",
  "skill.md": "text-chart-3",
  "other.md": "text-chart-4",
  "knowledge.md": "text-chart-5",
};

interface FileCardGridProps {
  files: InstructionFile[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string, e?: React.MouseEvent) => void;
  onFileClick: (file: InstructionFile) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onAttachment: (file: InstructionFile) => void;
  extraActions?: (file: InstructionFile) => React.ReactNode;
  emptyIcon?: React.ElementType;
  emptyMessage?: string;
}

export function FileCardGrid({
  files,
  selectedIds,
  onToggleSelect,
  onFileClick,
  onDelete,
  onAttachment,
  extraActions,
  emptyIcon: EmptyIcon = FileText,
  emptyMessage = "No files found",
}: FileCardGridProps) {
  const selectionMode = selectedIds.size > 0;

  if (files.length === 0) {
    return (
      <Card className="bg-card">
        <CardContent className="py-12 text-center">
          <EmptyIcon size={24} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {files.map((file) => {
        const isSelected = selectedIds.has(file.id);
        return (
          <Card
            key={file.id}
            className={`bg-card card-hover-glow cursor-pointer border ${isSelected ? "border-primary ring-1 ring-primary/30" : "border-border"}`}
            onClick={() => {
              if (selectionMode) {
                onToggleSelect(file.id);
              } else {
                onFileClick(file);
              }
            }}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={(e) => onToggleSelect(file.id, e)}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    title={isSelected ? "Deselect" : "Select for compose"}
                  >
                    {isSelected ? (
                      <CheckSquare size={14} className="text-primary" />
                    ) : (
                      <Square size={14} />
                    )}
                  </button>
                  <FileText
                    size={14}
                    className={`${FILE_TYPE_COLORS[file.fileType] || "text-chart-1"} shrink-0`}
                  />
                  <span className="text-sm font-semibold text-foreground truncate">
                    {file.fileName}
                  </span>
                  {!file.isEditable && (
                    <Lock
                      size={10}
                      className="text-muted-foreground shrink-0"
                    />
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {extraActions?.(file)}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAttachment(file);
                    }}
                    className="p-1 hover:bg-accent rounded transition-colors"
                    title="Manage attachments"
                  >
                    <Link size={12} className="text-muted-foreground" />
                  </button>
                  <button
                    onClick={(e) => onDelete(e, file.id)}
                    className="p-1 hover:bg-destructive/20 rounded transition-colors"
                    title="Remove from index"
                  >
                    <Trash2 size={12} className="text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="secondary" className="text-meta font-medium">
                  {file.fileType}
                </Badge>
                <Badge variant="outline" className="text-meta">
                  ~{file.tokenCount} tokens
                </Badge>
                {file.tags.slice(0, 2).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-meta">
                    {tag}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {file.content.slice(0, 150) || "Empty file"}
              </p>
              <div
                className="mt-2 text-detail text-muted-foreground font-mono truncate"
                title={file.filePath}
              >
                {file.filePath}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
