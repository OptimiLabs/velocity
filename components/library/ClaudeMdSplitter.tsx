"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Scissors,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
  FileText,
  Sparkles,
  Wrench,
  FolderTree,
  Wand2,
  Info,
  GitMerge,
} from "lucide-react";
import {
  useAnalyzeSplit,
  useExecuteSplit,
  useAISplit,
  useExistingStructure,
} from "@/hooks/useSplitter";
import type { InstructionFile } from "@/types/instructions";
import type { SplitResult } from "@/lib/instructions/claudemd-splitter";

const DEFAULT_CATEGORIES = [
  "frontend",
  "backend",
  "frameworks",
  "workflows",
  "tools",
  "general",
];

type SplitStep =
  | "file-pick"
  | "mode-choice"
  | "structure-choice"
  | "ai-plan"
  | "manual-review"
  | "results";

interface SectionState {
  included: boolean;
  category: string;
  filename: string;
  expanded: boolean;
}

interface ClaudeMdSplitterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claudeMdFiles: InstructionFile[];
  activeFile?: InstructionFile | null;
}

export function ClaudeMdSplitter({
  open,
  onOpenChange,
  claudeMdFiles,
  activeFile: activeFileProp,
}: ClaudeMdSplitterProps) {
  const [step, setStep] = useState<SplitStep>("file-pick");
  const [structureMode, setStructureMode] = useState<
    "existing" | "ai-decide" | null
  >(null);
  const [guidelines, setGuidelines] = useState("");
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);
  const [sectionStates, setSectionStates] = useState<SectionState[]>([]);
  const [updateRouter, setUpdateRouter] = useState(true);
  const [createdFiles, setCreatedFiles] = useState<
    { filePath: string; category: string; filename: string }[]
  >([]);

  const analyze = useAnalyzeSplit();
  const execute = useExecuteSplit();
  const aiSplit = useAISplit();
  const { data: existingStructure } = useExistingStructure();

  // Compute available categories: merge defaults with any from existing structure
  const availableCategories = useMemo(() => {
    const fromStructure = existingStructure?.categories ?? [];
    const merged = [...new Set([...DEFAULT_CATEGORIES, ...fromStructure])];
    return merged.sort();
  }, [existingStructure]);

  // When dialog opens, decide initial step based on activeFile prop
  useEffect(() => {
    if (!open) return;
    if (activeFileProp) {
      // Auto-analyze and skip to mode-choice
      setSelectedFilePath(activeFileProp.filePath);
      analyze.mutateAsync(activeFileProp.filePath).then((result) => {
        setSplitResult(result);
        setSectionStates(
          result.sections.map((s) => ({
            included: true,
            category: s.suggestedCategory,
            filename: s.suggestedFilename,
            expanded: false,
          })),
        );
        setStep("mode-choice");
      });
    } else {
      setStep("file-pick");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handlePickFile = async (file: InstructionFile) => {
    setSelectedFilePath(file.filePath);
    const result = await analyze.mutateAsync(file.filePath);
    setSplitResult(result);
    setSectionStates(
      result.sections.map((s) => ({
        included: true,
        category: s.suggestedCategory,
        filename: s.suggestedFilename,
        expanded: false,
      })),
    );
    setStep("mode-choice");
  };

  const handleModeSelect = (selected: "ai" | "manual") => {
    if (selected === "manual") {
      setStep("manual-review");
    } else {
      setStep("structure-choice");
    }
  };

  const handleStructureSelect = async (selected: "existing" | "ai-decide") => {
    setStructureMode(selected);
    await runAISplit(selected);
  };

  const runAISplit = async (structure: "existing" | "ai-decide") => {
    if (!selectedFilePath) return;

    const result = await aiSplit.mutateAsync({
      filePath: selectedFilePath,
      guidelines: guidelines.trim() || undefined,
      structureMode: structure,
      existingCategories:
        structure === "existing" ? existingStructure?.categories : undefined,
    });

    setSplitResult(result);
    // Apply AI assignments to section states
    setSectionStates(
      result.sections.map((s, i) => {
        const assignment = result.aiAssignments?.find((a) => a.index === i);
        return {
          included: true,
          category: assignment?.category ?? s.suggestedCategory,
          filename: assignment?.filename ?? s.suggestedFilename,
          expanded: false,
        };
      }),
    );
    setStep("ai-plan");
  };

  const handleRedo = async () => {
    if (!structureMode) return;
    await runAISplit(structureMode);
  };

  const includedCount = useMemo(
    () => sectionStates.filter((s) => s.included).length,
    [sectionStates],
  );

  const handleExecute = async () => {
    if (!splitResult || !selectedFilePath) return;

    const sections = splitResult.sections
      .map((s, i) => ({
        heading: s.heading,
        content: s.content,
        category: sectionStates[i].category,
        filename: sectionStates[i].filename,
      }))
      .filter((_, i) => sectionStates[i].included);

    const result = await execute.mutateAsync({
      sourceFilePath: selectedFilePath,
      sections,
      updateRouter,
    });

    setCreatedFiles(result.created || []);
    setStep("results");
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep("file-pick");
      setStructureMode(null);
      setGuidelines("");
      setSelectedFilePath(null);
      setSplitResult(null);
      setSectionStates([]);
      setCreatedFiles([]);
    }, 200);
  };

  const updateSection = (index: number, update: Partial<SectionState>) => {
    setSectionStates((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...update } : s)),
    );
  };


  const handleMergeCategory = (
    sourceCategory: string,
    targetCategory: string,
  ) => {
    setSectionStates((prev) =>
      prev.map((s) =>
        s.category === sourceCategory ? { ...s, category: targetCategory } : s,
      ),
    );
  };

  const goBack = () => {
    switch (step) {
      case "mode-choice":
        if (activeFileProp) {
          handleClose();
        } else {
          setStep("file-pick");
        }
        break;
      case "structure-choice":
        setStep("mode-choice");
        break;
      case "ai-plan":
        setStep("structure-choice");
        break;
      case "manual-review":
        setStep("mode-choice");
        break;
      default:
        handleClose();
    }
  };

  const stepDescription: Record<SplitStep, string> = {
    "file-pick": "Select a CLAUDE.md file to split by its headings.",
    "mode-choice": "Choose how to organize your sections into knowledge files.",
    "structure-choice": "Choose how to structure the categories.",
    "ai-plan":
      "Review AI-assigned categories. Edit anything, then split when ready.",
    "manual-review":
      "Review and customize the proposed splits. Each section becomes a knowledge file.",
    results: "Split complete.",
  };

  // --- Shared section list rendering ---
  const renderSectionList = () => {
    if (!splitResult) return null;

    // Build category options: merge defaults + AI-proposed + existing structure
    const allCategories = new Set(availableCategories);
    for (const state of sectionStates) {
      if (state.category) allCategories.add(state.category);
    }
    const categoryOptions = [...allCategories].sort();

    return (
      <div className="space-y-4">
        {/* Preamble */}
        {splitResult.preamble && (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              Preamble (kept in source, not split)
            </div>
            <pre className="text-xs text-foreground whitespace-pre-wrap line-clamp-4 font-mono">
              {splitResult.preamble}
            </pre>
          </div>
        )}

        {/* Sections grouped by category */}
        <div className="space-y-4">
          {(() => {
            // Group section indices by category
            const groupedSections = new Map<string, number[]>();
            sectionStates.forEach((state, i) => {
              const cat = state.category || "uncategorized";
              if (!groupedSections.has(cat)) groupedSections.set(cat, []);
              groupedSections.get(cat)!.push(i);
            });

            return [...groupedSections.entries()].map(
              ([category, indices]) => {
                const totalTokens = indices.reduce(
                  (sum, i) =>
                    sum +
                    (splitResult.sections[i]?.tokenEstimate ?? 0),
                  0,
                );

                return (
                  <div key={category} className="space-y-2">
                    {/* Category header */}
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs font-semibold text-foreground">
                        {category}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-meta text-muted-foreground"
                      >
                        {indices.length} section
                        {indices.length !== 1 ? "s" : ""}, ~
                        {totalTokens} tok
                      </Badge>
                      <div className="flex-1" />
                      {groupedSections.size > 1 && (
                        <div className="flex items-center gap-1">
                          <GitMerge
                            size={12}
                            className="text-muted-foreground"
                          />
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleMergeCategory(
                                  category,
                                  e.target.value,
                                );
                              }
                            }}
                            className="h-6 text-[11px] px-1.5 bg-card border border-border rounded-md text-muted-foreground cursor-pointer"
                          >
                            <option value="" disabled>
                              Merge into…
                            </option>
                            {[...groupedSections.keys()]
                              .filter((c) => c !== category)
                              .sort()
                              .map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Sections in this category */}
                    {indices.map((i) => {
                      const section = splitResult.sections[i];
                      const state = sectionStates[i];
                      if (!section || !state) return null;
                      return (
                        <div
                          key={i}
                          className={`rounded-md border ${state.included ? "border-border" : "border-border/40 opacity-50"} p-3 space-y-2`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={state.included}
                              onChange={(e) =>
                                updateSection(i, {
                                  included: e.target.checked,
                                })
                              }
                              className="rounded border-border"
                            />
                            <span className="text-sm font-medium text-foreground flex-1 truncate">
                              {section.heading.replace(/^#+\s*/, "")}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-meta shrink-0"
                            >
                              ~{section.tokenEstimate} tok
                            </Badge>
                            <button
                              onClick={() =>
                                updateSection(i, {
                                  expanded: !state.expanded,
                                })
                              }
                              className="p-0.5 hover:bg-accent rounded transition-colors"
                            >
                              {state.expanded ? (
                                <ChevronDown
                                  size={14}
                                  className="text-muted-foreground"
                                />
                              ) : (
                                <ChevronRight
                                  size={14}
                                  className="text-muted-foreground"
                                />
                              )}
                            </button>
                          </div>

                          {state.included && (
                            <div className="flex items-center gap-2">
                              <select
                                value={state.category}
                                onChange={(e) =>
                                  updateSection(i, {
                                    category: e.target.value,
                                  })
                                }
                                className="h-7 text-xs px-2 bg-card border border-border rounded-md text-foreground"
                              >
                                {categoryOptions.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                              <Input
                                value={state.filename}
                                onChange={(e) =>
                                  updateSection(i, {
                                    filename: e.target.value,
                                  })
                                }
                                className="h-7 text-xs flex-1"
                              />
                            </div>
                          )}

                          {state.expanded && (
                            <pre className="text-xs text-muted-foreground whitespace-pre-wrap max-h-[200px] overflow-y-auto bg-muted/30 rounded p-2 font-mono">
                              {section.content}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              },
            );
          })()}
        </div>

        {/* Router update checkbox */}
        <label className="flex items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={updateRouter}
            onChange={(e) => setUpdateRouter(e.target.checked)}
            className="rounded border-border"
          />
          Update source CLAUDE.md with router table entries
        </label>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[680px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Scissors size={14} />
            Split CLAUDE.md into Knowledge Files
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {stepDescription[step]}
          </DialogDescription>
        </DialogHeader>

        {/* Step: file-pick */}
        {step === "file-pick" && (
          <div className="space-y-2 py-2">
            {claudeMdFiles.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                No CLAUDE.md files found. Run a scan first.
              </p>
            ) : (
              claudeMdFiles.map((file) => (
                <button
                  key={file.id}
                  onClick={() => handlePickFile(file)}
                  disabled={analyze.isPending}
                  className="w-full flex items-center justify-between p-3 rounded-md border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-chart-1 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {file.fileName}
                      </div>
                      <div className="text-detail text-muted-foreground font-mono truncate">
                        {file.filePath}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-meta shrink-0">
                    ~{file.tokenCount} tokens
                  </Badge>
                </button>
              ))
            )}
            {analyze.isPending && (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <RefreshCw size={12} className="animate-spin" />
                Analyzing...
              </div>
            )}
          </div>
        )}

        {/* Step: mode-choice */}
        {step === "mode-choice" && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleModeSelect("ai")}
                className="flex flex-col items-center gap-2 p-4 rounded-md border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors text-center"
              >
                <Sparkles size={20} className="text-chart-4" />
                <span className="text-sm font-medium text-foreground">
                  AI organize
                </span>
                <span className="text-xs text-muted-foreground">
                  Let AI assign categories and filenames
                </span>
              </button>
              <button
                onClick={() => handleModeSelect("manual")}
                className="flex flex-col items-center gap-2 p-4 rounded-md border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors text-center"
              >
                <Wrench size={20} className="text-chart-2" />
                <span className="text-sm font-medium text-foreground">
                  Manual
                </span>
                <span className="text-xs text-muted-foreground">
                  Review and assign categories yourself
                </span>
              </button>
            </div>

            {/* Guidelines textarea */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Guidelines (optional)
              </label>
              <textarea
                value={guidelines}
                onChange={(e) => setGuidelines(e.target.value)}
                placeholder="e.g., Keep database stuff together, separate React from Next.js..."
                className="w-full min-h-[80px] resize-y text-xs px-3 py-2 bg-card border border-border rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        )}

        {/* Step: structure-choice */}
        {step === "structure-choice" && (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleStructureSelect("existing")}
                disabled={aiSplit.isPending}
                className="flex flex-col items-start gap-2 p-4 rounded-md border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors text-left"
              >
                <FolderTree size={18} className="text-chart-1" />
                <span className="text-sm font-medium text-foreground">
                  Use existing folders
                </span>
                <div className="flex flex-wrap gap-1">
                  {(existingStructure?.categories ?? []).length > 0 ? (
                    existingStructure!.categories.map((cat) => (
                      <Badge key={cat} variant="outline" className="text-micro">
                        {cat}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground/60">
                      No existing structure found
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={() => handleStructureSelect("ai-decide")}
                disabled={aiSplit.isPending}
                className="flex flex-col items-start gap-2 p-4 rounded-md border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors text-left"
              >
                <Wand2 size={18} className="text-chart-4" />
                <span className="text-sm font-medium text-foreground">
                  Let AI decide
                </span>
                <span className="text-xs text-muted-foreground">
                  AI proposes a fresh folder structure
                </span>
              </button>
            </div>

            {aiSplit.isPending && (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <RefreshCw size={12} className="animate-spin" />
                AI is organizing sections...
              </div>
            )}
          </div>
        )}

        {/* Step: ai-plan */}
        {step === "ai-plan" && splitResult && (
          <div className="space-y-4 py-2">
            {/* Redo toolbar */}
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info size={12} />
                Edit guidelines and redo to refine AI assignments
              </div>
              <div className="flex items-center gap-2">
                <textarea
                  value={guidelines}
                  onChange={(e) => setGuidelines(e.target.value)}
                  placeholder="Refine guidelines..."
                  className="flex-1 min-h-[60px] resize-y text-xs px-3 py-2 bg-card border border-border rounded-md text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1 shrink-0 h-14"
                  onClick={handleRedo}
                  disabled={aiSplit.isPending}
                >
                  {aiSplit.isPending ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  Redo
                </Button>
              </div>
            </div>

            {renderSectionList()}
          </div>
        )}

        {/* Step: manual-review */}
        {step === "manual-review" && splitResult && (
          <div className="space-y-4 py-2">
            {/* Show guidelines as context if provided */}
            {guidelines.trim() && (
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  Your guidelines
                </div>
                <p className="text-xs text-foreground/80">{guidelines}</p>
              </div>
            )}

            {renderSectionList()}
          </div>
        )}

        {/* Step: results */}
        {step === "results" && (
          <div className="space-y-3 py-2">
            {createdFiles.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2 rounded-md bg-muted/30"
              >
                <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground">
                    {file.filename}
                  </div>
                  <div className="text-detail text-muted-foreground font-mono truncate">
                    {file.filePath}
                  </div>
                </div>
                <Badge variant="outline" className="text-meta shrink-0">
                  {file.category}
                </Badge>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          {step === "file-pick" && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={handleClose}
            >
              Cancel
            </Button>
          )}
          {(step === "mode-choice" || step === "structure-choice") && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={goBack}
            >
              Back
            </Button>
          )}
          {(step === "ai-plan" || step === "manual-review") && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={goBack}
              >
                Back
              </Button>
              <Button
                size="sm"
                className="text-xs gap-1.5"
                onClick={handleExecute}
                disabled={execute.isPending || includedCount === 0}
              >
                {execute.isPending ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    Splitting...
                  </>
                ) : (
                  <>
                    <Scissors size={12} />
                    Split {includedCount} section
                    {includedCount !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </>
          )}
          {step === "results" && (
            <Button size="sm" className="text-xs" onClick={handleClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
