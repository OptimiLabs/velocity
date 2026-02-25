"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus, Sparkles, BookOpen } from "lucide-react";
import { SkillsPicker } from "@/components/console/SkillsPicker";
import {
  parseRouterEntries,
  extractPreamble,
  type RouterEntry,
} from "@/lib/instructions/router-parser";
import { generateRouterContent } from "@/lib/instructions/router-writer";

interface RouterBuilderProps {
  content: string;
  onContentChange: (content: string) => void;
}

export function RouterBuilder({
  content,
  onContentChange,
}: RouterBuilderProps) {
  const [entries, setEntries] = useState<RouterEntry[]>([]);
  const [preamble, setPreamble] = useState("");

  // Parse content on mount and when content changes externally
  useEffect(() => {
    setEntries(parseRouterEntries(content));
    setPreamble(extractPreamble(content));
  }, []); // Only on mount — internal changes push via onContentChange

  const regenerate = useCallback(
    (newEntries: RouterEntry[], newPreamble: string) => {
      const generated = generateRouterContent(newPreamble, newEntries);
      onContentChange(generated);
    },
    [onContentChange],
  );

  const updateEntry = (
    index: number,
    field: "trigger" | "path",
    value: string,
  ) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    setEntries(updated);
    regenerate(updated, preamble);
  };

  const removeEntry = (index: number) => {
    const updated = entries.filter((_, i) => i !== index);
    setEntries(updated);
    regenerate(updated, preamble);
  };

  const addSkillEntry = (skillName: string) => {
    const newEntry: RouterEntry = {
      trigger: "",
      path: skillName,
      category: "skills",
      type: "skill",
    };
    const updated = [...entries, newEntry];
    setEntries(updated);
    regenerate(updated, preamble);
  };

  const addKnowledgeEntry = () => {
    const newEntry: RouterEntry = {
      trigger: "",
      path: "",
      category: "other",
      type: "knowledge",
    };
    const updated = [...entries, newEntry];
    setEntries(updated);
    regenerate(updated, preamble);
  };

  const updateKnowledgePath = (index: number, rawPath: string) => {
    const updated = [...entries];
    const slashIdx = rawPath.indexOf("/");
    const category = slashIdx > 0 ? rawPath.slice(0, slashIdx) : "other";
    updated[index] = { ...updated[index], path: rawPath, category };
    setEntries(updated);
    regenerate(updated, preamble);
  };

  const handlePreambleChange = (value: string) => {
    setPreamble(value);
    regenerate(entries, value);
  };

  const skillEntries = entries
    .map((e, i) => ({ entry: e, index: i }))
    .filter((x) => x.entry.type === "skill");
  const knowledgeEntries = entries
    .map((e, i) => ({ entry: e, index: i }))
    .filter((x) => x.entry.type === "knowledge");

  return (
    <div className="flex flex-col gap-5 p-4 overflow-y-auto h-full">
      {/* Skills Section */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles size={12} className="text-chart-3" />
            Skill Routes
          </h3>
          <SkillsPicker
            onSelect={addSkillEntry}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-detail gap-1 px-2"
              >
                <Plus size={10} />
                Add Skill Rule
              </Button>
            }
          />
        </div>

        {skillEntries.length === 0 ? (
          <p className="text-detail text-muted-foreground py-3 text-center border border-dashed border-border rounded-md">
            No skill routes yet. Click &quot;Add Skill Rule&quot; to get
            started.
          </p>
        ) : (
          <div className="space-y-1.5">
            {skillEntries.map(({ entry, index }) => (
              <div
                key={`skill-${index}`}
                className="flex items-center gap-2 group"
              >
                <Input
                  value={entry.trigger}
                  onChange={(e) =>
                    updateEntry(index, "trigger", e.target.value)
                  }
                  placeholder="When..."
                  className="h-7 text-xs flex-1"
                />
                <span className="text-detail text-muted-foreground shrink-0">
                  &rarr;
                </span>
                <div className="flex items-center gap-1 min-w-[120px] px-2 py-1 rounded bg-muted border border-border">
                  <Sparkles size={10} className="text-chart-3 shrink-0" />
                  <span className="text-xs font-mono text-foreground truncate">
                    /{entry.path}
                  </span>
                </div>
                <button
                  onClick={() => removeEntry(index)}
                  className="p-1 hover:bg-destructive/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove rule"
                >
                  <Trash2 size={12} className="text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Knowledge Section */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <BookOpen size={12} className="text-chart-5" />
            Knowledge Routes
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-detail gap-1 px-2"
            onClick={addKnowledgeEntry}
          >
            <Plus size={10} />
            Add Knowledge Rule
          </Button>
        </div>

        {knowledgeEntries.length === 0 ? (
          <p className="text-detail text-muted-foreground py-3 text-center border border-dashed border-border rounded-md">
            No knowledge routes yet. Click &quot;Add Knowledge Rule&quot; to get
            started.
          </p>
        ) : (
          <div className="space-y-1.5">
            {knowledgeEntries.map(({ entry, index }) => (
              <div
                key={`knowledge-${index}`}
                className="flex items-center gap-2 group"
              >
                <Input
                  value={entry.trigger}
                  onChange={(e) =>
                    updateEntry(index, "trigger", e.target.value)
                  }
                  placeholder="When working on..."
                  className="h-7 text-xs flex-1"
                />
                <span className="text-detail text-muted-foreground shrink-0">
                  &rarr;
                </span>
                <Input
                  value={entry.path}
                  onChange={(e) => updateKnowledgePath(index, e.target.value)}
                  placeholder="category/file.md"
                  className="h-7 text-xs w-[200px] font-mono"
                />
                <button
                  onClick={() => removeEntry(index)}
                  className="p-1 hover:bg-destructive/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove rule"
                >
                  <Trash2 size={12} className="text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Preamble Section */}
      <section>
        <h3 className="text-xs font-semibold text-foreground mb-2">Preamble</h3>
        <Textarea
          value={preamble}
          onChange={(e) => handlePreambleChange(e.target.value)}
          placeholder="# Project Instructions&#10;&#10;General notes that appear before the router tables..."
          className="min-h-[100px] resize-y text-xs font-mono"
        />
        <p className="text-meta text-muted-foreground mt-1">
          Non-table content that appears at the top of the file.
        </p>
      </section>
    </div>
  );
}
