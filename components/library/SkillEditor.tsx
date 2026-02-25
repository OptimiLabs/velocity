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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Globe,
  FolderGit2,
  Check,
  FolderOpen,
  X,
  Sparkles,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DirectoryPicker } from "@/components/console/DirectoryPicker";
import { CollapsibleSection } from "@/components/tools/CollapsibleSection";
import { useGenerateSkill } from "@/hooks/useInstructions";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import { ProviderTargetModeSelector } from "@/components/providers/ProviderTargetModeSelector";
import { ArtifactConvertDialog } from "@/components/providers/ArtifactConvertDialog";
import type { ProviderTargetMode } from "@/types/provider-artifacts";
import type { ConfigProvider } from "@/types/provider";
import type { AIProvider } from "@/types/instructions";

interface SkillEditorProps {
  open: boolean;
  provider?: ConfigProvider;
  skillName?: string | null;
  editVisibility?: "global" | "project";
  editProjectPath?: string;
  editProjectName?: string;
  initialContent?: string;
  initialDescription?: string;
  initialName?: string;
  /** When set, hides the template picker and shows an AI generation panel instead */
  sourceContext?: string;
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
  // Fallback: detect /Users/<name> or /home/<name>
  const m = p.match(/^(\/(?:Users|home)\/[^/]+)(\/.*)/);
  if (m) return "~" + m[2];
  return p;
}

export function SkillEditor({
  open,
  provider = "claude",
  skillName,
  editVisibility,
  editProjectPath,
  editProjectName,
  initialContent,
  initialDescription,
  initialName,
  sourceContext,
  onClose,
  onSuccess,
}: SkillEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Visibility state
  const [visibility, setVisibility] = useState<"global" | "project">("global");
  const [selectedProjectPath, setSelectedProjectPath] = useState("");
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  // Project picker state
  const [projectSearch, setProjectSearch] = useState("");
  const [showBrowse, setShowBrowse] = useState(false);
  const [browsePath, setBrowsePath] = useState("");

  // AI generation state (analysis mode)
  const [guidelines, setGuidelines] = useState("");
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

  const isEditing = !!skillName;
  const hasGenerated = generationHistory.length > 0;

  const providerName =
    provider === "codex" ? "Codex" : provider === "gemini" ? "Gemini" : "Claude";
  const skillExampleName = name || "skill-name";
  const invocationHint =
    provider === "claude"
      ? `This becomes the slash command: /${skillExampleName}`
      : provider === "codex"
        ? `Saved as skill "${skillExampleName}". In Codex, use /skills or mention $${skillExampleName}.`
        : `Saved as skill "${skillExampleName}" for Gemini skill tooling.`;

  // Fetch projects for the dropdown
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

  // Load existing skill for editing
  useEffect(() => {
    if (open && skillName) {
      setLoading(true);
      // Set scope from props
      setVisibility(editVisibility || "global");
      setSelectedProjectPath(editProjectPath || "");

      const params =
        editVisibility === "project" && editProjectPath
          ? `?projectPath=${encodeURIComponent(editProjectPath)}&provider=${provider}`
          : `?provider=${provider}`;
      fetch(`/api/skills/${encodeURIComponent(skillName)}${params}`)
        .then((r) => r.json())
        .then((data) => {
          setName(data.name || skillName);
          setDescription(data.description || "");
          setContent(data.content || "");
        })
        .catch(() => setError("Failed to load skill"))
        .finally(() => setLoading(false));
    } else if (open) {
      setName(initialName || "");
      setDescription(initialDescription || "");
      setContent(initialContent || "");
      setError("");
      setVisibility(editVisibility || "global");
      setSelectedProjectPath(editProjectPath || "");
      setProjectSearch("");
      setShowBrowse(false);
      setBrowsePath("");
      // Reset generation state
      setGuidelines("");
      setGenerationHistory([]);
      setGenerationCost(0);
      setGenerationTokens(0);
      setGenerationProvider("claude-cli");
    }
  }, [
    open,
    provider,
    skillName,
    editVisibility,
    editProjectPath,
    initialContent,
    initialDescription,
    initialName,
  ]);

  const handleGenerate = useCallback(async () => {
    if (!guidelines.trim()) return;
    try {
      const result = await generateSkill.mutateAsync({
        name: name.trim() || "untitled-skill",
        prompt: guidelines.trim(),
        provider: generationProvider,
        sourceContext,
        targetProvider: generationTargetProvider,
        previousContent:
          generationHistory.length > 0
            ? generationHistory[generationHistory.length - 1]
            : undefined,
      });
      setContent(result.content);
      setGenerationHistory((prev) => [...prev, result.content]);
      setGenerationCost((prev) => prev + (result.cost || 0));
      setGenerationTokens((prev) => prev + (result.tokensUsed || 0));
      setError("");
      if (result.results && generationTargetProvider !== "claude") {
        toast.success("Skill conversion previews are ready");
        setConvertOpen(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    }
  }, [
    guidelines,
    name,
    sourceContext,
    generationHistory,
    generateSkill,
    generationProvider,
    generationTargetProvider,
  ]);

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      const effectiveProjectPath =
        visibility === "project" ? selectedProjectPath : undefined;
      const url = isEditing
        ? `/api/skills/${encodeURIComponent(skillName!)}?provider=${provider}`
        : "/api/skills";
      const method = isEditing ? "PUT" : "POST";
      const body: Record<string, string | undefined> = { content };
      if (!isEditing) body.name = name.trim();
      if (description.trim()) body.description = description.trim();
      if (visibility === "project") {
        body.projectPath = effectiveProjectPath;
      }
      body.provider = provider;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        setSaving(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  };

  const selectedProject = projects.find((p) => p.path === selectedProjectPath);

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="shrink-0 border-b border-border/40 px-5 py-4">
          <DialogTitle className="text-sm pr-8 break-words">
            {isEditing ? `Edit Skill: ${skillName}` : "New Custom Skill"}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="text-xs text-muted-foreground py-4 text-center">
              Loading...
            </div>
          ) : (
            <div className="space-y-6 min-w-0">
              {/* AI Generation panel — analysis mode (sourceContext provided) */}
              {!isEditing && sourceContext && (
                <div className="space-y-3">
                  <CollapsibleSection
                    title="Source Analysis"
                    defaultExpanded={false}
                    className="bg-muted/20"
                  >
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-[200px] overflow-y-auto font-mono leading-relaxed">
                      {sourceContext.slice(0, 3000)}
                      {sourceContext.length > 3000 ? "\n\n... (truncated)" : ""}
                    </pre>
                  </CollapsibleSection>

                  <div>
                    <label className="text-meta uppercase tracking-wider text-muted-foreground">
                      What should this skill do?
                    </label>
                    <Textarea
                      value={guidelines}
                      onChange={(e) => setGuidelines(e.target.value)}
                      placeholder="e.g. Create a code review checklist based on the patterns found in this analysis..."
                      className="min-h-[120px] resize-y text-xs mt-1"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <ProviderTargetModeSelector
                      value={generationTargetProvider}
                      onChange={setGenerationTargetProvider}
                      disabled={generateSkill.isPending}
                      className="h-8 min-w-[140px]"
                      ariaLabel="Skill generation target provider"
                    />
                    <select
                      value={generationProvider}
                      onChange={(e) =>
                        setGenerationProvider(e.target.value as GenerationProvider)
                      }
                      className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs"
                      disabled={generateSkill.isPending}
                    >
                      {providerOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleGenerate}
                      disabled={!guidelines.trim() || generateSkill.isPending}
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
                          ? "Regenerate"
                          : "Generate Skill"}
                    </Button>

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
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => setConvertOpen(true)}
                      disabled={!name.trim() || !content.trim()}
                    >
                      Convert
                    </Button>
                  </div>

                  {hasGenerated && generationHistory.length > 1 && (
                    <p className="text-meta text-muted-foreground/50">
                      AI builds on previous attempt — refine your guidelines above
                      to iterate
                    </p>
                  )}
                </div>
              )}

              {/* Scope picker */}
              <div>
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Scope
                </label>
                {isEditing ? (
                  <div className="flex items-center gap-2 mt-1 min-w-0">
                    {visibility === "global" ? (
                      <>
                        <Globe size={13} className="text-chart-5 shrink-0" />
                        <span className="text-xs text-muted-foreground min-w-0 truncate">
                          Global — available in all sessions
                        </span>
                      </>
                    ) : (
                      <>
                        <FolderGit2 size={13} className="text-chart-2 shrink-0" />
                        <span
                          className="text-xs text-muted-foreground min-w-0 truncate"
                          title={editProjectName || editProjectPath}
                        >
                          Project — {editProjectName || editProjectPath}
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 mt-1">
                    <div className="flex flex-col gap-2 sm:flex-row">
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
                            Available in all sessions
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
                            Available in{" "}
                            {selectedProject?.name || "selected project"} sessions
                          </div>
                        </div>
                      </button>
                    </div>

                    {visibility === "project" && (
                      <div className="space-y-2">
                        {/* Selected project indicator */}
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

                        {/* Project search + list */}
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
                                      onChange={(e) =>
                                        setProjectSearch(e.target.value)
                                      }
                                      placeholder="Search projects..."
                                      className="h-7 text-xs pl-7"
                                      autoFocus
                                    />
                                  </div>
                                )}
                                <div className="max-h-[180px] overflow-y-auto space-y-0.5 rounded-md border border-border/30 p-1">
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
                                        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-muted/50 transition-colors group/item overflow-hidden"
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
                                      No projects match &ldquo;{projectSearch}
                                      &rdquo;
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <p className="text-meta text-muted-foreground/50 italic">
                                No indexed projects found.
                              </p>
                            )}

                            {/* Browse filesystem button */}
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

                        {/* Directory browser */}
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
                                // Normalize: strip trailing slash
                                const normalized = browsePath.replace(/\/+$/, "");
                                if (normalized) {
                                  setSelectedProjectPath(normalized);
                                  setShowBrowse(false);
                                  setBrowsePath("");
                                }
                              }}
                            >
                              Use this directory
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-skill"
                  className="h-8 text-xs font-mono mt-1"
                  disabled={isEditing}
                />
                {!isEditing && (
                  <p className="text-meta text-text-tertiary mt-1">
                    {invocationHint}
                  </p>
                )}
              </div>

              <div>
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Description
                </label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder='e.g. Analyzes PR diffs for security issues. Use when user says "review PR", "security check", or "audit code".'
                  className="h-8 text-xs mt-1"
                />
                <p className="text-meta text-text-tertiary mt-1">
                  What it does + when to use it + trigger phrases. {providerName}
                  {" "}uses this context to decide whether to load the skill.
                </p>
              </div>

              <div>
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Content
                </label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={
                    '# Skill Name\n\n## Instructions\n\n### Step 1: [First step]\nClear explanation of what happens.\n\n### Step 2: [Next step]\nExpected output: [describe what success looks like]\n\n## Examples\n\nExample 1: [Common scenario]\nUser says: "..."\nActions:\n1. ...\n2. ...\nResult: ...\n\n## Troubleshooting\n\nError: [Common error]\nCause: [Why it happens]\nSolution: [How to fix]'
                  }
                  className="min-h-[300px] resize-y text-xs font-mono mt-1"
                />
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConvertOpen(true)}
                  disabled={!name.trim() || !content.trim()}
                >
                  Convert
                </Button>
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={
                    (!isEditing && !name.trim()) ||
                    !content.trim() ||
                    saving ||
                    (visibility === "project" &&
                      !isEditing &&
                      !selectedProjectPath)
                  }
                >
                  {saving ? "Saving..." : isEditing ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    <ArtifactConvertDialog
      open={convertOpen}
      onOpenChange={setConvertOpen}
      artifactType="skill"
      sourceProvider={provider}
      title={`Convert Skill${name ? `: ${name}` : ""}`}
      description="Preview and save skill/instruction variants for Claude, Codex, and Gemini."
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
            projectPath: visibility === "project" ? selectedProjectPath || undefined : undefined,
          },
        };
      }}
      defaultTarget={generationTargetProvider}
      onSaved={() => toast.success("Skill conversion save complete")}
    />
    </>
  );
}
