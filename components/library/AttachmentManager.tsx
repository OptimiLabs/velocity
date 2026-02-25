"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Trash2, FileText } from "lucide-react";
import {
  useAttachmentsForInstruction,
  useAttachInstruction,
  useDetachInstruction,
  useToggleAttachment,
} from "@/hooks/useInstructions";
import type {
  InstructionFile,
  AttachmentTargetType,
} from "@/types/instructions";

interface AttachmentManagerProps {
  file: InstructionFile;
  onClose: () => void;
}

const TARGET_TYPES: { value: AttachmentTargetType; label: string }[] = [
  { value: "agent", label: "Agent" },
  { value: "role", label: "Role" },
  { value: "session", label: "Session" },
  { value: "global", label: "Global" },
];

export function AttachmentManager({ file, onClose }: AttachmentManagerProps) {
  const [targetType, setTargetType] = useState<AttachmentTargetType>("agent");
  const [targetName, setTargetName] = useState("");

  const { data: attachments = [], isLoading } = useAttachmentsForInstruction(
    file.id,
  );
  const attachInstruction = useAttachInstruction();
  const detachInstruction = useDetachInstruction();
  const toggleAttachment = useToggleAttachment();

  const handleAttach = async () => {
    const name = targetType === "global" ? "global" : targetName.trim();
    if (!name) return;
    await attachInstruction.mutateAsync({
      instructionId: file.id,
      targetType,
      targetName: name,
    });
    setTargetName("");
  };

  const handleDetach = async (targetType: string, targetName: string) => {
    await detachInstruction.mutateAsync({
      instructionId: file.id,
      targetType,
      targetName,
    });
  };

  const handleToggle = async (
    targetType: string,
    targetName: string,
    enabled: boolean,
  ) => {
    await toggleAttachment.mutateAsync({
      instructionId: file.id,
      targetType,
      targetName,
      enabled,
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-chart-1" />
          <span className="text-sm font-semibold text-foreground">
            {file.fileName}
          </span>
          <span className="text-xs text-muted-foreground font-medium">
            — Attachments
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onClose}
        >
          <X size={12} />
          Close
        </Button>
      </div>

      {/* File info */}
      <div className="px-4 py-3 border-b border-border bg-muted">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-meta font-medium">
            {file.fileType}
          </Badge>
          <Badge variant="outline" className="text-meta">
            ~{file.tokenCount} tokens
          </Badge>
          <span className="text-detail text-muted-foreground font-mono">
            {file.filePath}
          </span>
        </div>
      </div>

      {/* Add attachment form */}
      <div className="px-4 py-3 border-b border-border space-y-2">
        <span className="text-xs text-foreground font-semibold">
          Attach to:
        </span>
        <div className="flex items-center gap-2">
          <select
            value={targetType}
            onChange={(e) =>
              setTargetType(e.target.value as AttachmentTargetType)
            }
            className="h-8 text-xs px-2 bg-card border border-border rounded-md text-foreground"
          >
            {TARGET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {targetType !== "global" && (
            <Input
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder={`${targetType} name...`}
              className="h-8 text-xs flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleAttach()}
            />
          )}
          <Button
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={handleAttach}
            disabled={
              attachInstruction.isPending ||
              (targetType !== "global" && !targetName.trim())
            }
          >
            <Plus size={12} />
            Attach
          </Button>
        </div>
      </div>

      {/* Attachment list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="text-xs text-muted-foreground text-center py-4">
            Loading...
          </div>
        ) : attachments.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8">
            No attachments yet. Attach this file to agents, roles, or sessions.
          </div>
        ) : (
          <div className="space-y-2">
            {attachments.map((att) => (
              <div
                key={`${att.targetType}-${att.targetName}`}
                className="flex items-center justify-between p-2.5 rounded-md border border-border bg-card"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-meta font-medium">
                    {att.targetType}
                  </Badge>
                  <span className="text-xs font-semibold text-foreground">
                    {att.targetName}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() =>
                      handleToggle(att.targetType, att.targetName, !att.enabled)
                    }
                    className={`text-detail font-medium px-2 py-0.5 rounded transition-colors ${
                      att.enabled
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {att.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    onClick={() => handleDetach(att.targetType, att.targetName)}
                    className="p-1 hover:bg-destructive/20 rounded transition-colors"
                  >
                    <Trash2 size={12} className="text-muted-foreground" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
