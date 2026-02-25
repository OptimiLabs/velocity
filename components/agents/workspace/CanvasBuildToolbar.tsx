"use client";

import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelLeftClose,
  Terminal,
  Rocket,
  RotateCcw,
  Save,
  Trash2,
  Unlink,
} from "lucide-react";

interface CanvasBuildToolbarProps {
  edgeCount: number;
  nodeCount: number;
  hasWorkflow: boolean;
  onSaveWorkflow: () => void;
  showSaveWorkflow?: boolean;
  actionSlot?: React.ReactNode;
  onDeploy?: () => void;
  deployLabel?: string;
  deployAsCommand?: boolean;
  showDeploy?: boolean;
  onDelete?: () => void;
  onClearEdges?: () => void;
  onClearCanvas?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  leftPanelOpen?: boolean;
  onToggleLeftPanel?: () => void;
  rightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
}

export function CanvasBuildToolbar({
  edgeCount,
  nodeCount,
  hasWorkflow,
  onSaveWorkflow,
  showSaveWorkflow = true,
  actionSlot,
  onDeploy,
  deployLabel = "Deploy",
  deployAsCommand = false,
  showDeploy = true,
  onDelete,
  onClearEdges,
  onClearCanvas,
  isFullscreen = false,
  onToggleFullscreen,
  leftPanelOpen,
  onToggleLeftPanel,
  rightPanelOpen,
  onToggleRightPanel,
}: CanvasBuildToolbarProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-card/95 backdrop-blur border border-border shadow-lg rounded-xl px-4 py-2 flex items-center gap-3">
      {/* Stats */}
      <span className="text-xs text-text-tertiary">
        {edgeCount > 0
          ? `${nodeCount} agents, ${edgeCount} edges`
          : `${nodeCount} agents`}
      </span>

      {/* Clear actions */}
      {(onClearEdges || onClearCanvas) && (
        <>
          <div className="w-px h-4 bg-border/50" />
          {onClearEdges && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={onClearEdges}
              disabled={edgeCount === 0}
            >
              <Unlink size={10} />
              Clear Connections
            </Button>
          )}
          {onClearCanvas && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={onClearCanvas}
              disabled={nodeCount === 0 && edgeCount === 0}
            >
              <RotateCcw size={10} />
              Reset Canvas
            </Button>
          )}
        </>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 ml-auto">
        {onToggleLeftPanel && (
          <Button
            variant={leftPanelOpen ? "secondary" : "outline"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onToggleLeftPanel}
            title={leftPanelOpen ? "Hide inventory panel" : "Show inventory panel"}
            aria-label={
              leftPanelOpen ? "Hide inventory panel" : "Show inventory panel"
            }
          >
            {leftPanelOpen ? <PanelLeftClose size={12} /> : <PanelLeft size={12} />}
          </Button>
        )}
        {onToggleRightPanel && (
          <Button
            variant={rightPanelOpen ? "secondary" : "outline"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onToggleRightPanel}
            title={rightPanelOpen ? "Hide details panel" : "Show details panel"}
            aria-label={
              rightPanelOpen ? "Hide details panel" : "Show details panel"
            }
          >
            {rightPanelOpen ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </Button>
        )}
        {onToggleFullscreen && (
          <Button
            variant={isFullscreen ? "secondary" : "outline"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onToggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </Button>
        )}
        {actionSlot ?? (
          <>
            {showSaveWorkflow && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={onSaveWorkflow}
                disabled={edgeCount === 0}
              >
                <Save size={10} />
                Save as Workflow
              </Button>
            )}
            {showDeploy && onDeploy && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={onDeploy}
                disabled={!hasWorkflow}
              >
                {deployAsCommand ? <Terminal size={10} /> : <Rocket size={10} />}
                {deployLabel}
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 size={10} />
                Delete
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
