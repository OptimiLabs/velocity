"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sparkles,
  Loader2,
  Globe,
  FolderGit2,
  Check,
  FolderOpen,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DirectoryPicker } from "@/components/console/DirectoryPicker";
import { useGenerateSkill } from "@/hooks/useInstructions";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import matter from "gray-matter";
import { ProviderTargetModeSelector } from "@/components/providers/ProviderTargetModeSelector";
import { ArtifactConvertDialog } from "@/components/providers/ArtifactConvertDialog";
import type { ProviderTargetMode } from "@/types/provider-artifacts";
import type { ConfigProvider } from "@/types/provider";
import type { AIProvider } from "@/types/instructions";

interface ProjectOption {
  id: string;
  path: string;
  name: string;
}

function shortenPath(p: string): string {
  const home =
    typeof process !== "undefined"
      ? process.env.HOME || process.env.USERPROFILE
      : undefined;
  if (home && p.startsWith(home)) return "~" + p.slice(home.length);
  const m = p.match(/^(\/(?:Users|home)\/[^/]+)(\/.*)/);
  if (m) return "~" + m[2];
  return p;
}

interface NewSkillDialogProps {
  open: boolean;
  provider?: ConfigProvider;
  onClose: () => void;
  onSuccess: () => void;
}

type ProviderListItem = Omit<AIProvider, "apiKeyEncrypted">;
type GenerationProvider =
  | "claude-cli"
  | "anthropic"
  | "openai"
  | "google"
  | "openrouter"
  | "local"
  | "custom";

export function NewSkillDialog({
  open,
  provider = "claude",
  onClose,
  onSuccess,
}: NewSkillDialogProps) {
  // Create form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // AI generation state
  const [intent, setIntent] = useState("");
  const [generationHistory, setGenerationHistory] = useState<string[]>([]);
  const [generationCost, setGenerationCost] = useState(0);
  const [generationTokens, setGenerationTokens] = useState(0);
  const [generationTargetProvider, setGenerationTargetProvider] =
    useState<ProviderTargetMode>("claude");
  const [generationProvider, setGenerationProvider] =
    useState<GenerationProvider>("claude-cli");
  const [providerOptions, setProviderOptions] = useState<
    { key: GenerationProvider; label: string }[]
  >([{ key: "claude-cli", label: "Claude CLI" }]);
  const [convertOpen, setConvertOpen] = useState(false);
  const generateSkill = useGenerateSkill();

  // Scope state
  const [visibility, setVisibility] = useState<"global" | "project">("global");
  const [selectedProjectPath, setSelectedProjectPath] = useState("");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [showBrowse, setShowBrowse] = useState(false);
  const [browsePath, setBrowsePath] = useState("");

  const selectedProject = projects.find((p) => p.path === selectedProjectPath);
  const hasGenerated = generationHistory.length > 0;

  useEffect(() => {
    if (!open) return;
    fetch("/api/projects?limit=100")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.projects;
        if (Array.isArray(list)) {
          setProjects(
            list.map((p: ProjectOption) => ({
              id: p.id,
              path: p.path,
              name: p.name,
            })),
          );
        }
      })
      .catch((err) => console.warn("[SKILLS]", err.message));

    fetch("/api/instructions/providers")
      .then((r) => r.json())
      .then((rows: ProviderListItem[] | unknown) => {
        const list = Array.isArray(rows) ? (rows as ProviderListItem[]) : [];
        const next: { key: GenerationProvider; label: string }[] = [
          { key: "claude-cli", label: "Claude CLI" },
        ];
        const seen = new Set<GenerationProvider>(["claude-cli"]);
        for (const row of list) {
          if (!row?.isActive) continue;
          const key = (row.providerSlug || row.provider) as GenerationProvider;
          if (
            key !== "anthropic" &&
            key !== "openai" &&
            key !== "google" &&
            key !== "openrouter" &&
            key !== "local" &&
            key !== "custom"
          ) {
            continue;
          }
          if (seen.has(key)) continue;
          seen.add(key);
          next.push({ key, label: row.displayName || key });
        }
        setProviderOptions(next);
      })
      .catch((err) => console.warn("[SKILLS]", err.message));
  }, [open]);

  const resetState = useCallback(() => {
    setName("");
    setDescription("");
    setContent("");
    setIntent("");
    setError("");
    setSaving(false);
    setGenerationHistory([]);
    setGenerationCost(0);
    setGenerationTokens(0);
    setGenerationTargetProvider("claude");
    setGenerationProvider("claude-cli");
    setVisibility("global");
    setSelectedProjectPath("");
    setProjectSearch("");
    setShowBrowse(false);
    setBrowsePath("");
    setConvertOpen(false);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!intent.trim()) return;
    setError("");
    try {
      const result = await generateSkill.mutateAsync({
        name: name.trim() || "untitled-skill",
        prompt: intent.trim(),
        provider: generationProvider,
        targetProvider: generationTargetProvider,
        previousContent:
          generationHistory.length > 0
            ? generationHistory[generationHistory.length - 1]
            : undefined,
      });

      const parsed = matter(result.content);
      if (parsed.data.name) setName(String(parsed.data.name));
      if (parsed.data.description) setDescription(String(parsed.data.description));
      setContent(parsed.content.trim());
      setGenerationHistory((prev) => [...prev, result.content]);
      setGenerationCost((prev) => prev + (result.cost || 0));
      setGenerationTokens((prev) => prev + (result.tokensUsed || 0));

      if (result.results && generationTargetProvider !== "claude") {
        toast.success("Skill conversion previews are ready");
        setConvertOpen(true);
      }
    } catch {
      // Error displayed through mutation state.
    }
  }, [
    intent,
    name,
    generationHistory,
    generateSkill,
    generationProvider,
    generationTargetProvider,
  ]);

  const handleSave = useCallback(async () => {
    setError("");

    if (!name.trim()) {
      setError("Skill name is required");
      return;
    }
    if (!content.trim()) {
      setError("Content is required");
      return;
    }
    if (visibility === "project" && !selectedProjectPath.trim()) {
      setError("Select a project for project-scoped skills");
      return;
    }

    setSaving(true);
    try {
      const payload: {
        name: string;
        description?: string;
        content: string;
        projectPath?: string;
        provider?: ConfigProvider;
      } = {
        name: name.trim(),
        content: content.trim(),
        provider,
      };
      if (description.trim()) payload.description = description.trim();
      if (visibility === "project") {
        payload.projectPath = selectedProjectPath.trim();
      }

      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Failed to create skill");
        setSaving(false);
        return;
      }

      const savedName = data?.name || payload.name;
      toast.success(`Created /${savedName}`);
      resetState();
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create skill");
    } finally {
      setSaving(false);
    }
  }, [
    content,
    description,
    name,
    onClose,
    onSuccess,
    provider,
    resetState,
    selectedProjectPath,
    visibility,
  ]);

  const handleDialogOpenChange = (v: boolean) => {
    if (!v) {
      resetState();
      onClose();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="text-sm">New Skill</DialogTitle>
            <DialogDescription className="text-xs mt-1">
              Create manually or generate a draft with AI, then save in one step.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Scope picker */}
            <div>
              <label className="text-meta uppercase tracking-wider text-muted-foreground">
                Scope
              </label>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setVisibility("global")}
                  className={cn(
                    "flex min-w-0 items-center gap-2 flex-1 p-2 rounded-md border text-left transition-colors overflow-hidden",
                    visibility === "global"
                      ? "border-chart-5/40 bg-chart-5/5"
                      : "border-border/30 hover:border-border",
                  )}
                >
                  <Globe
                    size={14}
                    className={cn(
                      visibility === "global"
                        ? "text-chart-5"
                        : "text-text-tertiary",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium">Global</div>
                    <div className="text-meta text-muted-foreground/50 truncate">
                      All sessions
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility("project")}
                  className={cn(
                    "flex min-w-0 items-center gap-2 flex-1 p-2 rounded-md border text-left transition-colors overflow-hidden",
                    visibility === "project"
                      ? "border-chart-2/40 bg-chart-2/5"
                      : "border-border/30 hover:border-border",
                  )}
                >
                  <FolderGit2
                    size={14}
                    className={cn(
                      visibility === "project"
                        ? "text-chart-2"
                        : "text-text-tertiary",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium">Project</div>
                    <div className="text-meta text-muted-foreground/50 truncate">
                      {selectedProject?.name || "Select a project"}
                    </div>
                  </div>
                </button>
              </div>

              {visibility === "project" && (
                <div className="space-y-2 mt-2">
                  {selectedProjectPath && !showBrowse && (
                    <div className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-chart-2/30 bg-chart-2/5 overflow-hidden">
                      <Check size={12} className="text-chart-2 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">
                          {selectedProject?.name ||
                            selectedProjectPath.split("/").pop()}
                        </div>
                        <div className="text-meta text-muted-foreground/50 font-mono truncate">
                          {shortenPath(selectedProjectPath)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProjectPath("");
                          setProjectSearch("");
                        }}
                        className="p-0.5 hover:bg-chart-2/10 rounded transition-colors"
                      >
                        <X size={11} className="text-muted-foreground/60" />
                      </button>
                    </div>
                  )}

                  {!selectedProjectPath && !showBrowse && (
                    <div>
                      {projects.length > 0 ? (
                        <div className="space-y-1.5">
                          {projects.length > 4 && (
                            <div className="relative">
                              <Search
                                size={12}
                                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                              />
                              <Input
                                value={projectSearch}
                                onChange={(e) => setProjectSearch(e.target.value)}
                                placeholder="Search projects..."
                                className="h-7 text-xs pl-7"
                              />
                            </div>
                          )}
                          <div className="max-h-[140px] overflow-y-auto space-y-0.5 rounded-md border border-border/30 p-1">
                            {projects
                              .filter((p) => {
                                if (!projectSearch) return true;
                                const q = projectSearch.toLowerCase();
                                return (
                                  p.name.toLowerCase().includes(q) ||
                                  p.path.toLowerCase().includes(q)
                                );
                              })
                              .map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedProjectPath(p.path);
                                    setProjectSearch("");
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-muted/50 transition-colors overflow-hidden"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FolderGit2
                                      size={12}
                                      className="text-chart-2/60 shrink-0"
                                    />
                                    <span className="text-xs font-medium truncate flex-1 min-w-0">
                                      {p.name}
                                    </span>
                                  </div>
                                  <div className="ml-5 mt-0.5 min-w-0">
                                    <div className="text-meta text-text-tertiary font-mono truncate block max-w-full">
                                      {shortenPath(p.path)}
                                    </div>
                                  </div>
                                </button>
                              ))}
                            {projects.filter((p) => {
                              if (!projectSearch) return true;
                              const q = projectSearch.toLowerCase();
                              return (
                                p.name.toLowerCase().includes(q) ||
                                p.path.toLowerCase().includes(q)
                              );
                            }).length === 0 && (
                              <div className="text-meta text-text-tertiary text-center py-3">
                                No projects match &ldquo;{projectSearch}&rdquo;
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-meta text-muted-foreground/50 italic">
                          No indexed projects found.
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowBrowse(true)}
                        className="flex items-center gap-1.5 mt-2 text-meta text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                      >
                        <FolderOpen size={11} />
                        Browse to a directory...
                      </button>
                    </div>
                  )}

                  {showBrowse && !selectedProjectPath && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-meta text-muted-foreground/60">
                          Browse to project directory
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowBrowse(false)}
                          className="text-meta text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                        >
                          Back to list
                        </button>
                      </div>
                      <DirectoryPicker
                        value={browsePath}
                        onChange={(val) => setBrowsePath(val)}
                        placeholder="~/projects/my-app"
                        compact
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs"
                        disabled={!browsePath.trim()}
                        onClick={() => {
                          const normalized = browsePath.replace(/\/+$/, "");
                          if (!normalized) return;
                          setSelectedProjectPath(normalized);
                          setShowBrowse(false);
                          setBrowsePath("");
                        }}
                      >
                        Use this directory
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Optional AI drafting */}
            <div>
              <label className="text-meta uppercase tracking-wider text-muted-foreground">
                AI Draft (Optional)
              </label>
              <Textarea
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="Describe what this skill should do..."
                className="min-h-[100px] resize-y text-xs mt-1"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                <div className="flex items-center gap-2">
                  <select
                    value={generationProvider}
                    onChange={(e) =>
                      setGenerationProvider(e.target.value as GenerationProvider)
                    }
                    className="h-7 rounded-md border border-border/50 bg-background px-2 text-xs"
                    disabled={generateSkill.isPending}
                  >
                    {providerOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ProviderTargetModeSelector
                    value={generationTargetProvider}
                    onChange={setGenerationTargetProvider}
                    disabled={generateSkill.isPending}
                    className="h-7 min-w-[140px]"
                    ariaLabel="Skill generation target provider"
                  />
                  {hasGenerated && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {generationHistory.length > 1 && (
                        <span>Generation {generationHistory.length}</span>
                      )}
                      <Badge variant="secondary" className="text-micro">
                        {formatCost(generationCost)}
                      </Badge>
                      <Badge variant="secondary" className="text-micro">
                        {formatTokens(generationTokens)} tok
                      </Badge>
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={handleGenerate}
                  disabled={!intent.trim() || generateSkill.isPending}
                  className="gap-1.5"
                >
                  {generateSkill.isPending ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Sparkles size={13} />
                  )}
                  {generateSkill.isPending
                    ? "Generating..."
                    : hasGenerated
                      ? "Regenerate Draft"
                      : "Generate Draft"}
                </Button>
              </div>

              {generateSkill.isError && (
                <p className="text-xs text-destructive mt-2">
                  {generateSkill.error?.message || "Generation failed"}
                </p>
              )}
            </div>

            {/* Core skill fields */}
            <div>
              <label className="text-meta uppercase tracking-wider text-muted-foreground">
                Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-skill"
                className="h-8 text-xs font-mono mt-1"
              />
              <p className="text-meta text-text-tertiary mt-1">
                Saved as <span className="font-mono">/{name || "my-skill"}</span>.
                Use lowercase letters, numbers, hyphens, or underscores.
              </p>
            </div>

            <div>
              <label className="text-meta uppercase tracking-wider text-muted-foreground">
                Description
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What it does and when to use it"
                className="h-8 text-xs mt-1"
              />
            </div>

            <div>
              <label className="text-meta uppercase tracking-wider text-muted-foreground">
                Content
              </label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="# Skill Name"
                className="min-h-[240px] resize-y text-xs font-mono mt-1"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setName("");
                  setDescription("");
                  setContent("");
                  setError("");
                }}
              >
                Clear fields
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConvertOpen(true)}
                  disabled={!name.trim() || !content.trim()}
                >
                  Convert
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    resetState();
                    onClose();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={
                    saving ||
                    !name.trim() ||
                    !content.trim() ||
                    (visibility === "project" && !selectedProjectPath.trim())
                  }
                >
                  {saving ? "Creating..." : "Create Skill"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ArtifactConvertDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        artifactType="skill"
        sourceProvider={provider}
        title={`Convert Skill${name.trim() ? `: ${name.trim()}` : ""}`}
        description="Preview/save provider-specific versions of this skill."
        getSource={() => {
          const trimmedName = name.trim();
          const trimmedContent = content.trim();
          if (!trimmedName || !trimmedContent) return null;
          return {
            kind: "inline" as const,
            data: {
              name: trimmedName,
              description: description.trim() || undefined,
              content: trimmedContent,
              visibility,
              projectPath:
                visibility === "project"
                  ? selectedProjectPath || undefined
                  : undefined,
            },
          };
        }}
        defaultTarget={generationTargetProvider}
        onSaved={() => {
          toast.success("Converted skill saved");
          onSuccess();
        }}
      />
    </>
  );
}
