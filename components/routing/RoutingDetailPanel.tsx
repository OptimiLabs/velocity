"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Pencil,
  Eye,
  Save,
  Loader2,
  FileText,
  ArrowRight,
  ArrowLeft,
  FolderOpen,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useRoutingStore } from "@/stores/routingStore";
import { useResizablePanel } from "@/hooks/useSidebarResize";
import { useFileContent, useDeleteRoutingNode } from "@/hooks/useRoutingGraph";
import { useConfirm } from "@/hooks/useConfirm";
import { toast } from "sonner";
import type { RoutingGraph } from "@/types/routing-graph";
import { estimateTokensFromBytes } from "@/lib/marketplace/token-estimate";
import { formatTokens } from "@/lib/cost/calculator";

interface RoutingDetailPanelProps {
  graph: RoutingGraph | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatFileBytes(bytes: number): string {
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

export function RoutingDetailPanel({
  graph,
  open,
  onOpenChange,
}: RoutingDetailPanelProps) {
  const {
    selectedNodeId,
    setSelectedNodeId,
    selectedFilePath,
    setSelectedFilePath,
    detailMode,
    setDetailMode,
    setFocusNodeId,
  } = useRoutingStore();

  const { data: fileData, isLoading } = useFileContent(selectedFilePath);
  const deleteNodeMutation = useDeleteRoutingNode();
  const { confirm } = useConfirm();

  const [editContent, setEditContent] = useState("");
  const { width: panelWidth, handleDragStart } = useResizablePanel({
    minWidth: 320,
    maxWidth: 760,
    defaultWidth: 420,
    storageKey: "routing-detail-panel-width",
    side: "right",
  });

  // Sync edit content when file data loads
  useEffect(() => {
    if (fileData?.content) {
      setEditContent(fileData.content);
    }
  }, [fileData?.content]);

  // Find graph node
  const graphNode = graph?.nodes.find((n) => n.id === selectedNodeId);

  // Find incoming/outgoing references
  const outgoing = graph?.edges.filter((e) => e.source === selectedNodeId) || [];
  const incoming = graph?.edges.filter((e) => e.target === selectedNodeId) || [];

  const handleSave = useCallback(async () => {
    if (!selectedFilePath) return;
    try {
      const res = await fetch("/api/filesystem/read", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedFilePath, content: editContent }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("File saved");
      setDetailMode("view");
    } catch {
      toast.error("Failed to save file");
    }
  }, [selectedFilePath, editContent, setDetailMode]);

  // Cmd+S to save
  useEffect(() => {
    if (detailMode !== "edit") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [detailMode, handleSave]);

  if (!open || !selectedNodeId) return null;

  return (
    <div
      className="border-l border-border/50 bg-background/90 backdrop-blur-sm flex flex-col shrink-0 animate-in slide-in-from-right-2 duration-200 relative"
      style={{ width: panelWidth }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
        onMouseDown={handleDragStart}
      />
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background/70">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={14} className="text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">
            {graphNode?.label || selectedFilePath?.split("/").pop() || "File"}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              navigator.clipboard.writeText(selectedFilePath || "");
              toast.success("Path copied");
            }}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Copy file path"
          >
            <FolderOpen size={14} />
          </button>
          <button
            onClick={() =>
              setDetailMode(detailMode === "edit" ? "view" : "edit")
            }
            className={cn(
              "p-1.5 rounded-md transition-colors",
              detailMode === "edit"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
            title={detailMode === "edit" ? "View mode" : "Edit mode"}
          >
            {detailMode === "edit" ? <Eye size={14} /> : <Pencil size={14} />}
          </button>
          <button
            onClick={async () => {
              const isMd = selectedNodeId?.endsWith(".md");
              const label = graphNode?.label || selectedFilePath?.split("/").pop() || "this node";
              const result = await confirm({
                title: isMd ? `Delete "${label}"?` : `Remove "${label}" from graph?`,
                description: isMd
                  ? "This will permanently remove the file from disk. This cannot be undone."
                  : "This removes the node from the knowledge graph. The original file won't be affected.",
                confirmLabel: isMd ? "Delete" : "Remove",
                variant: "destructive",
              });
              if (!result) return;
              deleteNodeMutation.mutate(
                { nodeId: selectedNodeId!, deleteFile: !!isMd },
                {
                  onSuccess: () => {
                    setSelectedNodeId(null);
                    setSelectedFilePath(null);
                  },
                },
              );
            }}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete node"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => {
              onOpenChange(false);
            }}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Collapse details panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : !fileData && graphNode && !graphNode.exists ? (
          <div className="px-4 py-8 text-center space-y-2">
            <AlertCircle size={20} className="mx-auto text-destructive" />
            <p className="text-sm text-muted-foreground">File not found</p>
            <p className="text-xs text-muted-foreground/50 font-mono">
              {selectedFilePath}
            </p>
          </div>
        ) : detailMode === "view" ? (
          <div className="px-4 py-3 flex flex-col gap-4 h-full">
            {/* Metadata */}
            <div className="space-y-2 shrink-0 rounded-lg border border-border/50 bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText size={12} />
                <span className="font-mono truncate">
                  {selectedFilePath}
                </span>
              </div>
              {graphNode && (
                <>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        graphNode.exists ? "bg-green-500" : "bg-red-500",
                      )}
                    />
                    <span>
                      {graphNode.exists ? "File exists" : "File missing"}
                    </span>
                    {graphNode.fileSize !== null && (
                      <>
                        <span className="text-muted-foreground/40">|</span>
                        <span className="tabular-nums">
                          {formatFileBytes(graphNode.fileSize)}
                        </span>
                        <span className="text-muted-foreground/40">|</span>
                        <span className="tabular-nums">
                          ~{formatTokens(estimateTokensFromBytes(graphNode.fileSize))} tok
                        </span>
                      </>
                    )}
                  </div>
                  {graphNode.nodeType === "claude-md" && (
                    <div className="text-meta px-1.5 py-0.5 rounded bg-primary/10 text-primary w-fit">
                      {graphNode.label || "Entrypoint file"}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Outgoing references */}
            {outgoing.length > 0 && (
              <div className="shrink-0">
                <h4 className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                  <ArrowRight size={12} className="text-primary" />
                  References ({outgoing.length})
                </h4>
                <div className="space-y-1 max-h-[200px] overflow-y-auto rounded-md border border-border/40 bg-muted/20 p-1">
                  {outgoing.map((edge) => (
                    <button
                      key={edge.id}
                      onClick={() => {
                        setSelectedNodeId(edge.target);
                        setSelectedFilePath(edge.target);
                        setFocusNodeId(edge.target);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 transition-colors"
                    >
                      <div className="font-mono truncate text-primary/80">
                        {edge.target.split("/").pop()}
                      </div>
                      {edge.context && (
                        <div className="text-muted-foreground/60 truncate">
                          {edge.context}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Incoming references */}
            {incoming.length > 0 && (
              <div className="shrink-0">
                <h4 className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
                  <ArrowLeft size={12} className="text-green-500" />
                  Referenced by ({incoming.length})
                </h4>
                <div className="space-y-1 max-h-[200px] overflow-y-auto rounded-md border border-border/40 bg-muted/20 p-1">
                  {incoming.map((edge) => (
                    <button
                      key={edge.id}
                      onClick={() => {
                        setSelectedNodeId(edge.source);
                        setSelectedFilePath(edge.source);
                        setFocusNodeId(edge.source);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 transition-colors"
                    >
                      <div className="font-mono truncate text-green-500/80">
                        {edge.source.split("/").pop()}
                      </div>
                      {edge.context && (
                        <div className="text-muted-foreground/60 truncate">
                          {edge.context}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Content preview */}
            <div className="flex flex-col min-h-0 flex-1">
              <h4 className="text-xs font-medium mb-1 shrink-0">Content</h4>
              <pre className="text-xs leading-5 text-muted-foreground font-mono bg-muted/30 rounded-md border border-border/40 p-3 overflow-auto flex-1 whitespace-pre-wrap">
                {fileData?.content || "No content available"}
              </pre>
            </div>
          </div>
        ) : (
          /* Edit mode */
          <div className="px-4 py-3 flex flex-col gap-3 h-full">
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex items-center justify-between shrink-0 mb-1.5">
                <label className="text-xs font-medium">Content</label>
                <span className="text-meta tabular-nums text-muted-foreground">
                  {editContent.length.toLocaleString()} chars
                </span>
              </div>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full flex-1 text-xs leading-5 font-mono rounded-md border border-border bg-muted/20 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>

            <div className="flex items-center justify-end pt-1 shrink-0">
              <Button
                size="sm"
                className="h-7"
                onClick={handleSave}
              >
                <Save size={12} className="mr-1" />
                Save (⌘S)
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
