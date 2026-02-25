"use client";

import { CheckCircle2, FolderOpen, Lightbulb } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ConfigProvider } from "@/types/provider";

export interface InstallResult {
  name: string;
  agents: string[];
  skills: string[];
  commands: string[];
  targetProvider?: ConfigProvider;
}

interface Props {
  result: InstallResult | null;
  open: boolean;
  onClose: () => void;
}

export function InstallResultDialog({ result, open, onClose }: Props) {
  if (!result) return null;

  const hasAgents = result.agents.length > 0;
  const hasSkillsOrCommands =
    result.skills.length > 0 || result.commands.length > 0;
  const provider = result.targetProvider ?? "claude";
  const agentsPath =
    provider === "codex"
      ? "~/.codex/config.toml ([agents.*] -> ~/.codex/agents/*.toml)"
      : provider === "gemini"
        ? "~/.gemini/velocity/agents/"
        : "~/.claude/agents/";
  const skillsPath =
    provider === "codex"
      ? "~/.codex/skills/"
      : provider === "gemini"
        ? "~/.gemini/velocity/skills/"
        : "~/.claude/skills/";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <CheckCircle2 size={16} className="text-emerald-500" />
            Installed: {result.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          {hasAgents && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-muted-foreground font-medium uppercase tracking-wide text-micro">
                <FolderOpen size={12} />
                {agentsPath}
              </div>
              <ul className="space-y-0.5 pl-5">
                {result.agents.map((name) => (
                  <li key={name} className="flex items-center gap-1.5">
                    <CheckCircle2
                      size={10}
                      className="text-emerald-500 shrink-0"
                    />
                    <span className="font-mono text-foreground">{name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasSkillsOrCommands && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-muted-foreground font-medium uppercase tracking-wide text-micro">
                <FolderOpen size={12} />
                {skillsPath}
              </div>
              <ul className="space-y-0.5 pl-5">
                {[...result.commands, ...result.skills].map((name) => (
                  <li key={name} className="flex items-center gap-1.5">
                    <CheckCircle2
                      size={10}
                      className="text-emerald-500 shrink-0"
                    />
                    <span className="font-mono text-foreground">{name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-start gap-1.5 rounded bg-muted/50 px-2.5 py-2 text-muted-foreground">
            <Lightbulb size={12} className="mt-0.5 shrink-0" />
            <span>
              Restart your CLI session to pick up new agents.
              {provider === "codex" && " Use /agent (singular) to select roles."}
              {hasSkillsOrCommands &&
                " Run slash commands (e.g. /command-name) to use skills."}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button size="sm" className="h-8" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
