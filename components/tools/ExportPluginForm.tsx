"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExportPluginFormProps {
  customSkills: Array<{ name: string; description?: string }>;
  onClose: () => void;
}

export function ExportPluginForm({
  customSkills,
  onClose,
}: ExportPluginFormProps) {
  const [pluginName, setPluginName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{
    path: string;
    structure: string[];
  } | null>(null);
  const [error, setError] = useState("");

  const toggleSkill = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleExport = async () => {
    setError("");
    setExporting(true);
    try {
      const res = await fetch("/api/tools/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pluginName: pluginName.trim(),
          skills: Array.from(selected),
          description: description.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Export failed");
        setExporting(false);
        return;
      }
      setResult(await res.json());
    } catch (e) {
      setError(String(e));
    }
    setExporting(false);
  };

  if (result) {
    return (
      <Card className="bg-emerald-500/5 border-emerald-500/20">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-500 dark:text-emerald-400">
            <Package size={14} />
            Plugin exported successfully
          </div>
          <div className="text-xs font-mono text-muted-foreground bg-muted/50 rounded p-2 break-all">
            {result.path}
          </div>
          <div className="text-meta text-muted-foreground">
            {result.structure.length} file
            {result.structure.length !== 1 ? "s" : ""} created
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-muted/30 border-chart-4/20">
      <CardContent className="p-4 space-y-4">
        <div className="text-xs font-medium">
          Bundle Custom Skills as Plugin
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-meta uppercase tracking-wider text-muted-foreground">
              Plugin Name
            </label>
            <Input
              value={pluginName}
              onChange={(e) => setPluginName(e.target.value)}
              placeholder="my-plugin"
              className="h-8 text-xs font-mono mt-1"
            />
          </div>
          <div>
            <label className="text-meta uppercase tracking-wider text-muted-foreground">
              Description (optional)
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A collection of useful skills"
              className="h-8 text-xs mt-1"
            />
          </div>
        </div>

        <div>
          <label className="text-meta uppercase tracking-wider text-muted-foreground">
            Select Skills
          </label>
          <div className="mt-1.5 space-y-1">
            {customSkills.map((skill) => (
              <button
                key={skill.name}
                onClick={() => toggleSkill(skill.name)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded text-left text-xs transition-colors",
                  selected.has(skill.name)
                    ? "bg-chart-4/10 text-foreground"
                    : "hover:bg-muted/50 text-muted-foreground",
                )}
              >
                <div
                  className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                    selected.has(skill.name)
                      ? "bg-chart-4 border-chart-4"
                      : "border-border",
                  )}
                >
                  {selected.has(skill.name) && (
                    <Check size={10} className="text-white" />
                  )}
                </div>
                <span className="font-mono">/{skill.name}</span>
                {skill.description && (
                  <span className="text-muted-foreground/60 truncate">
                    — {skill.description}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={!pluginName.trim() || selected.size === 0 || exporting}
          >
            {exporting ? "Exporting..." : "Export Plugin"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
