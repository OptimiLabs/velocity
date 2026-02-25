"use client";

import type { FileReadEntry, FileWriteEntry, FileCategory } from "@/types/session";
import { normalizeFilesModified } from "@/lib/parser/session-utils";
import {
  FileText,
  BookOpen,
  Settings,
  Code2,
  FileQuestion,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const CATEGORY_META: Record<
  FileCategory,
  { label: string; icon: React.ElementType; listFiles: boolean }
> = {
  knowledge: { label: "Knowledge", icon: BookOpen, listFiles: true },
  instruction: { label: "Instructions", icon: FileText, listFiles: true },
  agent: { label: "Agents", icon: FileText, listFiles: true },
  config: { label: "Config", icon: Settings, listFiles: false },
  code: { label: "Code", icon: Code2, listFiles: false },
  other: { label: "Other", icon: FileQuestion, listFiles: false },
};

const CATEGORY_ORDER: FileCategory[] = [
  "knowledge",
  "instruction",
  "agent",
  "config",
  "code",
  "other",
];

function shortenPath(path: string): string {
  return path
    .replace(/^\/Users\/[^/]+/, "~")
    .replace(/~\/.claude\/knowledge\//, "")
    .replace(/~\/.claude\/projects\/[^/]+\//, "");
}

interface DataUtilizedSectionProps {
  filesRead: FileReadEntry[];
  filesModified: string[] | FileWriteEntry[];
}

export function DataUtilizedSection({
  filesRead,
  filesModified: rawFilesModified,
}: DataUtilizedSectionProps) {
  const filesModified = normalizeFilesModified(rawFilesModified);
  // Group by category
  const grouped = new Map<FileCategory, FileReadEntry[]>();
  for (const entry of filesRead) {
    const existing = grouped.get(entry.category) ?? [];
    existing.push(entry);
    grouped.set(entry.category, existing);
  }

  const categories = CATEGORY_ORDER.filter((c) => grouped.has(c));

  return (
    <div className="space-y-2">
      {categories.map((cat) => {
        const entries = grouped.get(cat)!;
        const meta = CATEGORY_META[cat];
        const Icon = meta.icon;
        const totalReads = entries.reduce((s, e) => s + e.count, 0);

        if (meta.listFiles) {
          return (
            <div
              key={cat}
              className="rounded-lg border border-border/35 bg-background/45 p-2"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon size={11} />
                  <span className="font-medium text-foreground/85">{meta.label}</span>
                </div>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] tabular-nums">
                  {totalReads} reads
                </Badge>
              </div>
              <div className="space-y-1">
                {entries
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 5)
                  .map((entry) => (
                    <div
                      key={entry.path}
                      className="flex items-baseline justify-between gap-2 rounded-md border border-border/30 bg-background/65 px-2 py-1 text-[11px] font-mono text-foreground/70"
                    >
                      <span className="truncate mr-1.5" title={entry.path}>
                        {shortenPath(entry.path)}
                      </span>
                      {entry.count > 1 && (
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          &times;{entry.count}
                        </span>
                      )}
                    </div>
                  ))}
                {entries.length > 5 && (
                  <div className="text-[11px] text-muted-foreground">
                    +{entries.length - 5} more
                  </div>
                )}
              </div>
            </div>
          );
        }

        // Summary-only for code/config/other
        return (
          <div
            key={cat}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/35 bg-background/45 px-2.5 py-2 text-xs text-muted-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon size={11} />
              {meta.label}: {entries.length} files
            </span>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] tabular-nums">
              {totalReads} reads
            </Badge>
          </div>
        );
      })}

      {filesModified.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-border/35 bg-background/45 px-2.5 py-2 text-xs text-muted-foreground">
          <span>{filesModified.length} files modified</span>
          <span className="text-[11px] tabular-nums">
            {filesModified.reduce((s, e) => s + e.count, 0)} writes
          </span>
        </div>
      )}
    </div>
  );
}
