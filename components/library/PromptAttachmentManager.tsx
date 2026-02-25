"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Unlink, ChevronDown } from "lucide-react";
import type { PromptAttachment, PromptSnippet } from "@/types/library";

interface PromptAttachmentManagerProps {
  targetType: PromptAttachment["targetType"];
  targetName: string;
  snippets: PromptSnippet[];
  attachments: PromptAttachment[];
  onAttach: (promptId: string, position: PromptAttachment["position"]) => void;
  onDetach: (promptId: string) => void;
}

export function PromptAttachmentManager({
  targetType: _targetType,
  targetName: _targetName,
  snippets,
  attachments,
  onAttach,
  onDetach,
}: PromptAttachmentManagerProps) {
  const [expanded, setExpanded] = useState(false);

  const attachedIds = new Set(attachments.map((a) => a.promptId));
  const attachedBefore = attachments.filter((a) => a.position === "before");
  const attachedAfter = attachments.filter((a) => a.position === "after");
  const available = snippets.filter((s) => !attachedIds.has(s.id));

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Link2 size={12} />
        Prompt Attachments
        <Badge variant="secondary" className="text-micro">
          {attachments.length}
        </Badge>
        <ChevronDown
          size={10}
          className={`transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="space-y-3 pl-4 border-l-2 border-border/50">
          {attachedBefore.length > 0 && (
            <div>
              <div className="text-meta text-muted-foreground/50 uppercase tracking-wider mb-1">
                Pre-prompts
              </div>
              {attachedBefore.map((a) => {
                const snippet = snippets.find((s) => s.id === a.promptId);
                return snippet ? (
                  <div
                    key={a.promptId}
                    className="flex items-center gap-2 text-xs py-0.5"
                  >
                    <span className="font-mono">{snippet.name}</span>
                    <button
                      onClick={() => onDetach(a.promptId)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Unlink size={10} />
                    </button>
                  </div>
                ) : null;
              })}
            </div>
          )}

          {attachedAfter.length > 0 && (
            <div>
              <div className="text-meta text-muted-foreground/50 uppercase tracking-wider mb-1">
                Post-prompts
              </div>
              {attachedAfter.map((a) => {
                const snippet = snippets.find((s) => s.id === a.promptId);
                return snippet ? (
                  <div
                    key={a.promptId}
                    className="flex items-center gap-2 text-xs py-0.5"
                  >
                    <span className="font-mono">{snippet.name}</span>
                    <button
                      onClick={() => onDetach(a.promptId)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Unlink size={10} />
                    </button>
                  </div>
                ) : null;
              })}
            </div>
          )}

          {available.length > 0 && (
            <div>
              <div className="text-meta text-muted-foreground/50 uppercase tracking-wider mb-1">
                Available
              </div>
              {available.slice(0, 5).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 text-xs py-0.5"
                >
                  <span className="font-mono text-muted-foreground">
                    {s.name}
                  </span>
                  <Badge variant="outline" className="text-micro">
                    {s.category}
                  </Badge>
                  <div className="flex gap-1 ml-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-micro"
                      onClick={() => onAttach(s.id, "before")}
                    >
                      +Pre
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-micro"
                      onClick={() => onAttach(s.id, "after")}
                    >
                      +Post
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
