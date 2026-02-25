"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  FileText,
  Bot,
  FolderOpen,
  Terminal,
  Database,
  HardDrive,
} from "lucide-react";

interface StorageFile {
  name: string;
  bytes: number;
}

interface StorageBucket {
  label: string;
  path: string;
  fileCount: number;
  totalBytes: number;
  files: StorageFile[];
}

interface DatabaseEntry {
  name: string;
  bytes: number;
}

interface StorageData {
  buckets: StorageBucket[];
  databases: DatabaseEntry[];
  dbTotalBytes: number;
  totalBytes: number;
  totalFiles: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const BUCKET_ICONS: Record<string, React.ElementType> = {
  Knowledge: BookOpen,
  Instructions: FileText,
  Skills: Terminal,
  Agents: Bot,
  "Project Memory": FolderOpen,
};

function useStorage() {
  return useQuery({
    queryKey: ["system-storage"],
    queryFn: async (): Promise<StorageData> => {
      const res = await fetch("/api/system/storage");
      if (!res.ok) throw new Error("Failed to fetch storage");
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function StorageTab() {
  const { data, isLoading } = useStorage();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!data) return null;

  const maxBucketBytes = Math.max(
    ...data.buckets.map((b) => b.totalBytes),
    data.dbTotalBytes,
    1,
  );

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-baseline gap-4">
        <div className="flex items-center gap-2">
          <HardDrive size={14} className="text-muted-foreground" />
          <span className="text-sm font-medium">
            {formatBytes(data.totalBytes)}
          </span>
          <span className="text-xs text-muted-foreground">
            across {data.totalFiles} files
          </span>
        </div>
      </div>

      {/* Buckets */}
      <div className="space-y-3">
        {data.buckets.map((bucket) => {
          const Icon = BUCKET_ICONS[bucket.label] ?? FileText;
          const pct =
            maxBucketBytes > 0 ? (bucket.totalBytes / maxBucketBytes) * 100 : 0;

          return (
            <div key={bucket.label} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Icon size={13} className="text-muted-foreground" />
                  <span className="font-medium">{bucket.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {bucket.fileCount} files
                  </span>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatBytes(bucket.totalBytes)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-foreground/20 transition-all"
                  style={{ width: `${Math.max(pct, 1)}%` }}
                />
              </div>
              {/* Top files */}
              {bucket.files.length > 0 && (
                <div className="pl-5 space-y-0.5">
                  {bucket.files.slice(0, 5).map((f) => (
                    <div
                      key={f.name}
                      className="flex items-baseline justify-between text-xs"
                    >
                      <span className="font-mono text-meta text-text-tertiary truncate mr-2">
                        {f.name}
                      </span>
                      <span className="tabular-nums text-muted-foreground text-meta shrink-0">
                        {formatBytes(f.bytes)}
                      </span>
                    </div>
                  ))}
                  {bucket.files.length > 5 && (
                    <div className="text-meta text-muted-foreground">
                      +{bucket.fileCount - 5} more
                    </div>
                  )}
                </div>
              )}
              {bucket.fileCount === 0 && (
                <div className="pl-5 text-meta text-muted-foreground/60">
                  No files
                </div>
              )}
            </div>
          );
        })}

        {/* Databases */}
        {data.databases.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Database size={13} className="text-muted-foreground" />
                <span className="font-medium">Databases</span>
                <span className="text-xs text-muted-foreground">
                  {data.databases.length} files
                </span>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatBytes(data.dbTotalBytes)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-foreground/20 transition-all"
                style={{
                  width: `${Math.max((data.dbTotalBytes / maxBucketBytes) * 100, 1)}%`,
                }}
              />
            </div>
            <div className="pl-5 space-y-0.5">
              {data.databases.map((db) => (
                <div
                  key={db.name}
                  className="flex items-baseline justify-between text-xs"
                >
                  <span className="text-text-tertiary">{db.name}</span>
                  <span className="tabular-nums text-muted-foreground text-meta shrink-0">
                    {formatBytes(db.bytes)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
