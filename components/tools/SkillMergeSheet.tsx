"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Sparkles,
  Loader2,
  Archive,
  Save,
  RefreshCw,
  Globe,
  FolderGit2,
  ChevronDown,
  ChevronRight,
  ArrowDownToLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMergeSkills, useArchiveSkills } from "@/hooks/useSkillMerge";
import { formatCost } from "@/lib/cost/calculator";

interface SkillMergeSheetProps {
  open: boolean;
  onClose: () => void;
  skills: Array<{
    name: string;
    origin: "user" | "plugin";
    projectPath?: string;
    content?: string;
  }>;
  onSuccess: () => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function SkillPreviewCard({
  skill,
  defaultExpanded,
}: {
  skill: SkillMergeSheetProps["skills"][number];
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="relative pl-5">
      {/* Dot on the connector line */}
      <div className="absolute left-0 top-3 w-2 h-2 rounded-full bg-border ring-2 ring-background z-10" />
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full text-left group"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-muted-foreground shrink-0" />
        )}
        <span className="text-xs font-medium truncate">{skill.name}</span>
        <Badge
          variant="outline"
          className={cn(
            "text-micro ml-auto shrink-0",
            skill.origin === "plugin"
              ? "border-chart-4/30 text-chart-4"
              : skill.projectPath
                ? "border-chart-2/30 text-chart-2"
                : "border-chart-5/30 text-chart-5",
          )}
        >
          {skill.origin === "plugin"
            ? "plugin"
            : skill.projectPath
              ? "project"
              : "global"}
        </Badge>
      </button>
      {expanded && skill.content && (
        <pre className="mt-1.5 text-[11px] font-mono text-muted-foreground bg-muted/30 rounded p-2 max-h-[120px] overflow-y-auto whitespace-pre-wrap leading-relaxed border border-border/60">
          {skill.content}
        </pre>
      )}
    </div>
  );
}

export function SkillMergeSheet({
  open,
  onClose,
  skills,
  onSuccess,
}: SkillMergeSheetProps) {
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<"global" | "project">("global");
  const [projectPath, setProjectPath] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [totalCost, setTotalCost] = useState(0);

  const mergeMutation = useMergeSkills();
  const archiveMutation = useArchiveSkills();

  const hasResult = !!content;
  const defaultExpanded = skills.length <= 3;

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    try {
      const history = chatMessages.length > 0 ? chatMessages : undefined;

      const result = await mergeMutation.mutateAsync({
        skills,
        prompt: prompt.trim(),
        history,
      });

      setContent(result.content);
      if (!name) setName(result.name);
      if (!description) setDescription(result.description);
      if (result.category) setCategory(result.category);
      setTotalCost((prev) => prev + result.cost);

      setChatMessages((prev) => [
        ...prev,
        { role: "user", content: prompt.trim() },
        { role: "assistant", content: result.content },
      ]);
      setPrompt("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merge failed");
    }
  }, [prompt, chatMessages, skills, name, description, mergeMutation]);

  const handleSave = async (archiveOriginals: boolean) => {
    if (!name.trim() || !content.trim()) return;

    try {
      // Save the new merged skill
      const saveRes = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          content,
          category,
          projectPath: visibility === "project" ? projectPath : undefined,
        }),
      });

      if (!saveRes.ok) {
        const data = await saveRes.json();
        toast.error(data.error || "Failed to save merged skill");
        return;
      }

      // Archive originals if requested (only custom skills — plugin skills are read-only)
      if (archiveOriginals) {
        const archivable = skills.filter((s) => s.origin !== "plugin");
        if (archivable.length > 0) {
          await archiveMutation.mutateAsync({ skills: archivable });
        }
      }

      toast.success(
        archiveOriginals
          ? `Created "${name}" — invoke with /${name} in Claude. Archived ${skills.length} originals`
          : `Created "${name}" — invoke with /${name} in Claude`,
      );
      onSuccess();
      handleClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const handleClose = () => {
    setPrompt("");
    setName("");
    setDescription("");
    setContent("");
    setVisibility("global");
    setProjectPath("");
    setChatMessages([]);
    setTotalCost(0);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent
        side="right"
        className="!w-[440px] !max-w-[440px] flex flex-col overflow-hidden"
      >
        <SheetHeader className="shrink-0 pb-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg border bg-muted/50">
              <Sparkles size={20} className="text-foreground/80" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base">Merge Skills</SheetTitle>
              <SheetDescription className="text-xs">
                Combine multiple skills into one
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-3">
          {/* Skill preview cards with connector line */}
          <div className="rounded-md border border-border/60 p-3 bg-muted/20">
            <label className="text-meta uppercase tracking-wider text-muted-foreground">
              Merging {skills.length} skills
            </label>
            <div className="relative mt-2 space-y-2">
              {/* Vertical connector line */}
              <div className="absolute left-[3px] top-1 bottom-6 w-px bg-border/50" />
              {skills.map((s) => (
                <SkillPreviewCard
                  key={`${s.origin}-${s.name}`}
                  skill={s}
                  defaultExpanded={defaultExpanded}
                />
              ))}
              {/* Convergence indicator */}
              <div className="flex items-center gap-1.5 pl-5 pt-1 text-muted-foreground/50">
                <ArrowDownToLine size={12} />
                <span className="text-micro">merge into one</span>
              </div>
            </div>
          </div>

          {/* Chat history */}
          {chatMessages.length > 0 && (
            <div className="space-y-2 max-h-[200px] overflow-y-auto border border-border/60 rounded-md p-2">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "text-xs rounded p-2",
                    msg.role === "user"
                      ? "bg-muted/40 text-foreground"
                      : "bg-chart-5/5 text-muted-foreground font-mono",
                  )}
                >
                  <span className="text-micro text-muted-foreground/60 uppercase">
                    {msg.role}
                  </span>
                  <p className="mt-0.5 line-clamp-3">{msg.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* Prompt input with inline merge button */}
          <div>
            <label className="text-meta uppercase tracking-wider text-muted-foreground">
              {hasResult
                ? "Refine your merge"
                : "How should these skills be merged?"}
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground/70 leading-relaxed">
              This box is instructions for the AI. It generates a draft only.
              Nothing is saved until you choose a save action below.
            </p>
            <div className="relative mt-1">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.metaKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                placeholder={
                  hasResult
                    ? "Add more instructions to refine the merged skill..."
                    : "e.g. Combine these into a single code review skill that covers all scenarios..."
                }
                className="min-h-[120px] pb-10 resize-y text-xs"
              />
              <div className="absolute bottom-2 right-2 flex items-center gap-2">
                {totalCost > 0 && (
                  <Badge variant="secondary" className="text-micro">
                    {formatCost(totalCost)}
                  </Badge>
                )}
                <Button
                  size="sm"
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || mergeMutation.isPending}
                  className="gap-1.5 h-7 text-xs"
                >
                  {mergeMutation.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  {mergeMutation.isPending
                    ? "Merging..."
                    : hasResult
                      ? "Refine"
                      : "Merge"}
                </Button>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground/60">
              Tip: press <span className="font-mono">Cmd+Enter</span> to merge or
              refine.
            </p>
          </div>

          {/* Preview */}
          {hasResult && (
            <div className="space-y-3">
              <div className="border-t border-border/30 pt-3">
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Preview (Not Saved Yet)
                </label>
                <pre className="mt-1.5 text-xs font-mono bg-muted/30 rounded-md p-3 max-h-[250px] overflow-y-auto whitespace-pre-wrap leading-relaxed border border-border/60">
                  {content}
                </pre>
              </div>

              {/* Metadata */}
              <div className="space-y-2">
                <div>
                  <label className="text-meta uppercase tracking-wider text-muted-foreground">
                    Name
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="merged-skill"
                    className="h-8 text-xs font-mono mt-1"
                  />
                </div>
                <div>
                  <label className="text-meta uppercase tracking-wider text-muted-foreground">
                    Description
                  </label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What this merged skill does"
                    className="h-8 text-xs mt-1"
                  />
                </div>

                {/* Scope selector */}
                <div>
                  <label className="text-meta uppercase tracking-wider text-muted-foreground">
                    Scope
                  </label>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => setVisibility("global")}
                      className={cn(
                        "flex items-center gap-2 flex-1 p-2 rounded-md border text-left transition-colors",
                        visibility === "global"
                          ? "border-chart-5/40 bg-chart-5/5 text-chart-5"
                          : "border-border/30 text-muted-foreground hover:border-border",
                      )}
                    >
                      <Globe size={14} className="shrink-0" />
                      <div>
                        <div className="text-xs font-medium">Global</div>
                        <div className="text-meta text-muted-foreground/50">
                          Available everywhere
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => setVisibility("project")}
                      className={cn(
                        "flex items-center gap-2 flex-1 p-2 rounded-md border text-left transition-colors",
                        visibility === "project"
                          ? "border-chart-2/40 bg-chart-2/5 text-chart-2"
                          : "border-border/30 text-muted-foreground hover:border-border",
                      )}
                    >
                      <FolderGit2 size={14} className="shrink-0" />
                      <div>
                        <div className="text-xs font-medium">Project</div>
                        <div className="text-meta text-muted-foreground/50">
                          This project only
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions footer */}
        {hasResult && (
          <div className="shrink-0 border-t border-border/30 pt-3 space-y-2">
            <div className="text-[11px] text-muted-foreground/70 leading-relaxed">
              <span className="font-medium text-foreground/90">
                Save & Archive Originals:
              </span>{" "}
              saves merged skill and archives original custom skills (plugin skills
              are never archived).{" "}
              <span className="font-medium text-foreground/90">Save Only:</span>{" "}
              saves merged skill and keeps originals unchanged.{" "}
              <span className="font-medium text-foreground/90">Reset:</span>{" "}
              clears this draft/preview without saving.
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => handleSave(true)}
                disabled={!name.trim() || archiveMutation.isPending}
                className="gap-1.5 text-xs"
              >
                <Archive size={12} />
                {archiveMutation.isPending
                  ? "Saving..."
                  : "Save & Archive Originals"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSave(false)}
                disabled={!name.trim()}
                className="gap-1.5 text-xs"
              >
                <Save size={12} />
                Save Only
              </Button>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setContent("");
                  setPrompt("");
                }}
                className="gap-1.5 text-xs text-muted-foreground"
              >
                <RefreshCw size={12} />
                Reset
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
