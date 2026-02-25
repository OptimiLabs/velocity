"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Save,
  X,
  Wand2,
  ChevronDown,
  ChevronUp,
  Lock,
  Copy,
  Code,
  LayoutGrid,
  GitBranch,
} from "lucide-react";
import { useUpdateInstruction, useAIEdit } from "@/hooks/useInstructions";
import { RouterBuilder } from "@/components/library/RouterBuilder";
import { ArtifactConvertDialog } from "@/components/providers/ArtifactConvertDialog";
import type { InstructionFile } from "@/types/instructions";
import type { ConfigProvider } from "@/types/provider";

interface InstructionEditorProps {
  file: InstructionFile;
  onClose: () => void;
}

type EditorMode = "raw" | "builder";

export function InstructionEditor({ file, onClose }: InstructionEditorProps) {
  const [content, setContent] = useState(file.content);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("raw");
  const [convertOpen, setConvertOpen] = useState(false);

  const updateInstruction = useUpdateInstruction();
  const aiEdit = useAIEdit();

  const isClaudeMd = file.fileType === "CLAUDE.md";
  const sourceProvider = useMemo<ConfigProvider | undefined>(() => {
    const lowerName = file.fileName.toLowerCase();
    if (lowerName === "agents.md") return "codex";
    if (lowerName === "gemini.md") return "gemini";
    if (lowerName === "claude.md") return "claude";
    if (file.fileType === "agents.md") return "codex";
    if (file.fileType === "CLAUDE.md") return "claude";
    return undefined;
  }, [file.fileName, file.fileType]);
  const tokenCount = useMemo(() => Math.ceil(content.length / 4), [content]);
  const hasChanges = content !== file.content;

  const handleSave = async () => {
    if (!file.isEditable) return;
    await updateInstruction.mutateAsync({ id: file.id, data: { content } });
    onClose();
  };

  const handleAIEdit = async (provider: string) => {
    if (!aiPrompt.trim()) return;
    const result = await aiEdit.mutateAsync({
      id: file.id,
      provider,
      prompt: aiPrompt.trim(),
    });
    if (result.file) {
      setContent(result.file.content);
      setAiPrompt("");
    }
  };

  const handleCopyPath = async () => {
    await navigator.clipboard.writeText(file.filePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConvertSaved = () => {
    toast.success("Converted file(s) saved");
  };

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-foreground truncate">
            {file.fileName}
          </span>
          <Badge variant="secondary" className="text-meta font-medium">
            {file.fileType}
          </Badge>
          <Badge variant="outline" className="text-meta">
            ~{tokenCount} tokens
          </Badge>
          {!file.isEditable && (
            <Badge variant="outline" className="text-meta gap-0.5">
              <Lock size={8} />
              Read-only
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Raw / Builder toggle — only for CLAUDE.md files */}
          {isClaudeMd && (
            <div className="flex items-center rounded-md border border-border overflow-hidden mr-1">
              <button
                className={`h-6 px-2 text-detail flex items-center gap-1 transition-colors ${
                  editorMode === "raw"
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setEditorMode("raw")}
              >
                <Code size={10} />
                Raw
              </button>
              <button
                className={`h-6 px-2 text-detail flex items-center gap-1 transition-colors ${
                  editorMode === "builder"
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setEditorMode("builder")}
              >
                <LayoutGrid size={10} />
                Builder
              </button>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleCopyPath}
          >
            <Copy size={12} />
            {copied ? "Copied!" : "Copy Path"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setConvertOpen(true)}
          >
            <GitBranch size={12} />
            Convert
          </Button>
          {file.isEditable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setShowAIPanel(!showAIPanel)}
            >
              <Wand2 size={12} />
              AI Edit
              {showAIPanel ? (
                <ChevronUp size={10} />
              ) : (
                <ChevronDown size={10} />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onClose}
          >
            <X size={12} />
            Close
          </Button>
          {file.isEditable && (
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleSave}
              disabled={!hasChanges || updateInstruction.isPending}
            >
              <Save size={12} />
              {updateInstruction.isPending ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
        </div>

        {/* AI Panel */}
        {showAIPanel && (
        <div className="px-4 py-3 border-b border-border bg-muted space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Describe the edit you want (e.g. 'Add a section about error handling')"
              className="h-8 text-xs flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleAIEdit("claude-cli")}
              disabled={aiEdit.isPending}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-detail text-muted-foreground font-medium mr-1">
              Provider:
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-detail px-2"
              onClick={() => handleAIEdit("claude-cli")}
              disabled={aiEdit.isPending || !aiPrompt.trim()}
            >
              Claude CLI
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-detail px-2"
              onClick={() => handleAIEdit("anthropic")}
              disabled={aiEdit.isPending || !aiPrompt.trim()}
            >
              Anthropic API
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-detail px-2"
              onClick={() => handleAIEdit("openai")}
              disabled={aiEdit.isPending || !aiPrompt.trim()}
            >
              OpenAI
            </Button>
            {aiEdit.isPending && (
              <span className="text-detail text-muted-foreground ml-2">
                Editing with AI...
              </span>
            )}
            {aiEdit.isError && (
              <span className="text-detail text-destructive font-medium ml-2">
                {aiEdit.error.message}
              </span>
            )}
          </div>
        </div>
        )}

        {/* File path */}
        <div className="px-4 py-1.5 border-b border-border bg-muted">
          <span className="text-detail text-muted-foreground font-mono">
            {file.filePath}
          </span>
        </div>

        {/* Editor */}
        <div className="flex-1 p-0 overflow-hidden">
          {editorMode === "builder" && isClaudeMd ? (
            <RouterBuilder content={content} onContentChange={setContent} />
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="File content..."
              className="w-full h-full resize-none bg-transparent p-4 text-sm font-mono leading-relaxed focus:outline-none text-foreground"
              spellCheck={false}
              readOnly={!file.isEditable}
            />
          )}
        </div>
      </div>
      <ArtifactConvertDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        artifactType="instruction"
        sourceProvider={sourceProvider}
        title={`Convert ${file.fileName}`}
        description="Generate CLAUDE.md, AGENTS.md, and GEMINI.md variants from this instruction file."
        getSource={() => ({ kind: "instruction", id: file.id })}
        onSaved={handleConvertSaved}
      />
    </>
  );
}
