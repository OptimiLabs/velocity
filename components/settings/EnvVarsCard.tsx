"use client";

import { useState } from "react";
import { Plus, Trash2, Variable } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ClaudeSettings } from "@/lib/claude-settings";

interface EnvVarsCardProps {
  settings: ClaudeSettings;
  onUpdate: (partial: Partial<ClaudeSettings>) => Promise<void>;
}

export function EnvVarsCard({ settings, onUpdate }: EnvVarsCardProps) {
  const envVars = (settings.env || {}) as Record<string, string>;
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const addVar = async () => {
    const key = newKey.trim();
    if (!key) return;
    await onUpdate({ env: { ...envVars, [key]: newValue } });
    setNewKey("");
    setNewValue("");
  };

  const removeVar = async (key: string) => {
    const next = { ...envVars };
    delete next[key];
    await onUpdate({ env: next });
  };

  const entries = Object.entries(envVars).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <Card className="card-hover-glow border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Variable size={14} />
          Environment Variables
        </CardTitle>
        <CardDescription>
          Set environment variables for new Claude sessions. Changes apply to
          sessions created after saving.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.length > 0 && (
          <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/15 p-2">
            {entries.map(([key, value]) => (
              <div
                key={key}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 group hover:bg-background/70 transition-colors"
              >
                <Badge variant="outline" className="font-mono text-[10px]">
                  {key}
                </Badge>
                <span className="text-xs text-muted-foreground">=</span>
                <span className="text-xs font-mono text-muted-foreground flex-1 truncate">
                  {value}
                </span>
                <button
                  onClick={() => removeVar(key)}
                  className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border/70 bg-background/40 p-2 sm:flex-row sm:items-center">
          <Input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.toUpperCase())}
            placeholder="KEY"
            className="h-8 w-full text-xs font-mono sm:w-[170px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") addVar();
            }}
          />
          <span className="hidden text-xs text-muted-foreground sm:inline">=</span>
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value"
            className="h-8 flex-1 text-xs font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") addVar();
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={addVar}
            disabled={!newKey.trim()}
          >
            <Plus size={12} /> Add
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          Added variables are staged until you save the Claude settings section.
        </div>
      </CardContent>
    </Card>
  );
}
