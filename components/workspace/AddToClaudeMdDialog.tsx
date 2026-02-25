"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/sessions/MarkdownContent";
import {
  useKnowledgeFiles,
  useUpdateInstruction,
  useSummarizeContent,
  useProviders,
  useAddRouterEntry,
} from "@/hooks/useInstructions";
import { toast } from "sonner";
import {
  FilePlus,
  FilePen,
  Wand2,
  Loader2,
  Search,
  Send,
  Check,
} from "lucide-react";
import type { InstructionFile } from "@/types/instructions";

const CATEGORIES = [
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "frameworks", label: "Frameworks" },
  { value: "workflows", label: "Workflows" },
  { value: "tools", label: "Tools" },
];

const AI_PRESETS = [
  { label: "Summarize", prompt: undefined },
  {
    label: "Make concise",
    prompt:
      "Make this content more concise. Remove redundancy while preserving all key information and actionable guidelines.",
  },
  {
    label: "Add guidelines",
    prompt:
      "Transform this into clear, actionable guidelines as bullet points. Add best practices and common pitfalls.",
  },
] as const;

interface AddToClaudeMdDialogProps {
  open: boolean;
  onClose: () => void;
  analysis: string;
  sessionSlug?: string;
}

export function AddToClaudeMdDialog({
  open,
  onClose,
  analysis,
  sessionSlug,
}: AddToClaudeMdDialogProps) {
  // Mode: create new file vs add to existing
  const [mode, setMode] = useState<"create" | "existing">("create");

  // Create mode fields
  const [category, setCategory] = useState("workflows");
  const [trigger, setTrigger] = useState(
    sessionSlug
      ? `When working on tasks similar to ${sessionSlug}`
      : "When working on...",
  );
  const [filename, setFilename] = useState(
    sessionSlug ? `${sessionSlug}-insights` : "session-insights",
  );

  // Existing file picker
  const [selectedFile, setSelectedFile] = useState<InstructionFile | null>(
    null,
  );
  const [insertPosition, setInsertPosition] = useState<"append" | "prepend">(
    "append",
  );
  const [fileSearch, setFileSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Shared content
  const [content, setContent] = useState(analysis);
  const [contentTab, setContentTab] = useState<string>("edit");

  // AI refinement
  const [showAI, setShowAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  // Saving state
  const [saving, setSaving] = useState(false);

  // Hooks
  const { data: knowledgeFiles } = useKnowledgeFiles(
    filterCategory === "all" ? undefined : filterCategory,
    fileSearch || undefined,
  );
  const updateInstruction = useUpdateInstruction();
  const summarize = useSummarizeContent();
  const { data: providers } = useProviders();
  const addRouterEntry = useAddRouterEntry();

  const hasProvider = useMemo(() => {
    if (!providers) return false;
    return Array.isArray(providers) ? providers.length > 0 : false;
  }, [providers]);

  // AI refine handler
  const handleAIRefine = async (preset?: (typeof AI_PRESETS)[number]) => {
    if (!content.trim()) return;
    try {
      const result = await summarize.mutateAsync({
        content,
        prompt: preset?.prompt,
      });
      setContent(result.summary);
      setContentTab("edit");
    } catch {
      // error toast handled by hook
    }
  };

  const handleCustomAIRefine = async () => {
    if (!aiPrompt.trim() || !content.trim()) return;
    try {
      const result = await summarize.mutateAsync({
        content,
        prompt: aiPrompt.trim(),
      });
      setContent(result.summary);
      setAiPrompt("");
      setContentTab("edit");
    } catch {
      // error toast handled by hook
    }
  };

  // Save handler for create mode
  const handleSaveCreate = async () => {
    if (!trigger.trim() || !filename.trim() || !content.trim()) return;
    setSaving(true);

    try {
      const createRes = await fetch("/api/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          filename: filename.trim(),
          category,
          content: content.trim(),
        }),
      });

      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save knowledge file");
      }

      const { filename: savedFilename } = await createRes.json();

      const routerRes = await fetch("/api/instructions/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-entry",
          trigger: trigger.trim(),
          path: `${category}/${savedFilename}`,
          category,
          type: "knowledge",
        }),
      });

      if (!routerRes.ok) {
        const data = await routerRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add router entry");
      }

      toast.success("Insight saved to CLAUDE.md knowledge base");
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save insight",
      );
    } finally {
      setSaving(false);
    }
  };

  // Save handler for existing mode
  const handleSaveExisting = async () => {
    if (!selectedFile || !content.trim()) return;
    setSaving(true);

    try {
      // Fetch current file content
      const fileRes = await fetch(`/api/instructions/${selectedFile.id}`);
      if (!fileRes.ok) throw new Error("Failed to fetch existing file");
      const fileData: InstructionFile = await fileRes.json();

      // Merge content
      const existingContent = fileData.content || "";
      const separator = "\n\n---\n\n";
      const merged =
        insertPosition === "append"
          ? existingContent + separator + content.trim()
          : content.trim() + separator + existingContent;

      // Update the file
      await updateInstruction.mutateAsync({
        id: selectedFile.id,
        data: { content: merged },
      });

      // If file has no router entry and trigger is provided, add one
      if (trigger.trim() && selectedFile.category) {
        try {
          await addRouterEntry.mutateAsync({
            trigger: trigger.trim(),
            path: `${selectedFile.category}/${selectedFile.fileName}`,
            category: selectedFile.category,
          });
        } catch {
          // Non-critical — file was saved, router entry may already exist
        }
      }

      toast.success(`Content added to ${selectedFile.fileName}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update file");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = mode === "create" ? handleSaveCreate : handleSaveExisting;

  const isSaveDisabled =
    saving ||
    !content.trim() ||
    (mode === "create" && (!trigger.trim() || !filename.trim())) ||
    (mode === "existing" && !selectedFile);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Add Insight to CLAUDE.md
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-1 p-0.5 bg-muted rounded-md w-fit">
            <button
              onClick={() => setMode("create")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                mode === "create"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FilePlus className="size-3.5" />
              Create New
            </button>
            <button
              onClick={() => setMode("existing")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                mode === "existing"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FilePen className="size-3.5" />
              Add to Existing
            </button>
          </div>

          {/* Create New Mode */}
          {mode === "create" && (
            <>
              <div className="space-y-1.5">
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Category
                </label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem
                        key={c.value}
                        value={c.value}
                        className="text-xs"
                      >
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Trigger (when to show this knowledge)
                </label>
                <Input
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                  placeholder="When working on..."
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Filename
                </label>
                <Input
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="my-insight"
                  className="h-8 text-xs font-mono"
                />
                <p className="text-micro text-muted-foreground">
                  Saved to: ~/.claude/knowledge/{category}/{filename || "..."}
                  .md
                </p>
              </div>
            </>
          )}

          {/* Add to Existing Mode */}
          {mode === "existing" && (
            <>
              <div className="space-y-1.5">
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Filter by category
                </label>
                <Select
                  value={filterCategory}
                  onValueChange={setFilterCategory}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">
                      All Categories
                    </SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem
                        key={c.value}
                        value={c.value}
                        className="text-xs"
                      >
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  placeholder="Search knowledge files..."
                  className="h-8 text-xs pl-8"
                />
              </div>

              <ScrollArea className="max-h-[180px] border rounded-md">
                <div className="p-1">
                  {knowledgeFiles && knowledgeFiles.length > 0 ? (
                    knowledgeFiles.map((file) => (
                      <button
                        key={file.id}
                        onClick={() => setSelectedFile(file)}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded text-left text-xs transition-colors ${
                          selectedFile?.id === file.id
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted"
                        }`}
                      >
                        {selectedFile?.id === file.id && (
                          <Check className="size-3.5 shrink-0" />
                        )}
                        <span className="truncate font-medium flex-1">
                          {file.fileName}
                        </span>
                        {file.category && (
                          <Badge
                            variant="outline"
                            className="text-micro shrink-0"
                          >
                            {file.category}
                          </Badge>
                        )}
                        <span className="text-muted-foreground text-micro shrink-0">
                          {file.charCount.toLocaleString()} chars
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground p-3 text-center">
                      No knowledge files found
                    </p>
                  )}
                </div>
              </ScrollArea>

              {/* Insert position toggle */}
              <div className="flex items-center gap-3">
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Insert
                </label>
                <div className="flex gap-1 p-0.5 bg-muted rounded-md">
                  <button
                    onClick={() => setInsertPosition("append")}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      insertPosition === "append"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Append
                  </button>
                  <button
                    onClick={() => setInsertPosition("prepend")}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      insertPosition === "prepend"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Prepend
                  </button>
                </div>
              </div>

              {/* Optional trigger for files without router entry */}
              <div className="space-y-1.5">
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Trigger (optional — adds router entry if missing)
                </label>
                <Input
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                  placeholder="When working on..."
                  className="h-8 text-xs"
                />
              </div>
            </>
          )}

          {/* Content Section with Edit/Preview Tabs */}
          <div className="space-y-1.5">
            <label className="text-meta uppercase tracking-wider text-muted-foreground">
              Content
            </label>
            <Tabs value={contentTab} onValueChange={setContentTab}>
              <TabsList className="h-8">
                <TabsTrigger value="edit" className="text-xs px-3 h-6">
                  Edit
                </TabsTrigger>
                <TabsTrigger value="preview" className="text-xs px-3 h-6">
                  Preview
                </TabsTrigger>
              </TabsList>
              <TabsContent value="edit" className="mt-2">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[200px] resize-y text-xs font-mono"
                />
              </TabsContent>
              <TabsContent value="preview" className="mt-2">
                <ScrollArea className="min-h-[200px] max-h-[300px] border rounded-md p-3">
                  {content.trim() ? (
                    <MarkdownContent content={content} />
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      Nothing to preview
                    </p>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>

          {/* AI Refine Bar */}
          <div className="space-y-2">
            <button
              onClick={() => setShowAI((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Wand2 className="size-3.5" />
              <span className="font-medium">AI Refine</span>
              {!hasProvider && (
                <span className="text-micro text-muted-foreground/60">
                  (no provider configured)
                </span>
              )}
            </button>

            {showAI && (
              <div className="space-y-2 p-3 border rounded-md bg-muted/30">
                {/* Preset buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {AI_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={summarize.isPending || !content.trim()}
                      onClick={() => handleAIRefine(preset)}
                    >
                      {summarize.isPending ? (
                        <Loader2 className="size-3 mr-1 animate-spin" />
                      ) : null}
                      {preset.label}
                    </Button>
                  ))}
                </div>

                {/* Free-form prompt */}
                <div className="flex gap-1.5">
                  <Input
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Custom instruction... e.g. 'Focus on TypeScript patterns'"
                    className="h-8 text-xs flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleCustomAIRefine();
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5"
                    disabled={
                      summarize.isPending || !aiPrompt.trim() || !content.trim()
                    }
                    onClick={handleCustomAIRefine}
                  >
                    {summarize.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaveDisabled}>
              {saving
                ? "Saving..."
                : mode === "create"
                  ? "Save to Knowledge Base"
                  : "Update File"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
