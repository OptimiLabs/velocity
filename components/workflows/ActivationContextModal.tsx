"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, RefreshCw, Terminal } from "lucide-react";
import { useSuggestCommand } from "@/hooks/useWorkflows";

interface ActivationContextModalProps {
  workflowId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: {
    commandName: string | null;
    commandDescription: string | null;
    activationContext: string | null;
    autoSkillEnabled: boolean;
  };
  onSave: (values: {
    commandName: string;
    commandDescription: string;
    activationContext: string;
    autoSkillEnabled: boolean;
  }) => void;
}

export function ActivationContextModal({
  workflowId,
  open,
  onOpenChange,
  initialValues,
  onSave,
}: ActivationContextModalProps) {
  const [commandName, setCommandName] = useState("");
  const [description, setDescription] = useState("");
  const [activationContext, setActivationContext] = useState("");
  const [autoSkill, setAutoSkill] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);

  const suggest = useSuggestCommand();

  // Populate from initial values or trigger AI suggestion
  useEffect(() => {
    if (!open || !workflowId) return;

    if (initialValues?.commandName) {
      setCommandName(initialValues.commandName);
      setDescription(initialValues.commandDescription ?? "");
      setActivationContext(initialValues.activationContext ?? "");
      setAutoSkill(initialValues.autoSkillEnabled);
      setHasLoaded(true);
    } else if (!hasLoaded) {
      suggest.mutate(workflowId, {
        onSuccess: (data) => {
          setCommandName(data.commandName);
          setDescription(data.description);
          setActivationContext(data.activationContext);
          setHasLoaded(true);
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workflowId]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setHasLoaded(false);
    }
  }, [open]);

  const handleRegenerate = () => {
    if (!workflowId) return;
    suggest.mutate(workflowId, {
      onSuccess: (data) => {
        setCommandName(data.commandName);
        setDescription(data.description);
        setActivationContext(data.activationContext);
      },
    });
  };

  const handleSave = () => {
    if (!commandName.trim()) return;
    onSave({
      commandName: commandName.trim(),
      commandDescription: description.trim(),
      activationContext: activationContext.trim(),
      autoSkillEnabled: autoSkill,
    });
    onOpenChange(false);
  };

  const isLoading = suggest.isPending && !hasLoaded;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Terminal size={14} />
            Configure Skill Command
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Generating suggestions...
          </div>
        ) : (
          <div className="space-y-4">
            {/* Command name */}
            <div>
              <label className="text-meta uppercase tracking-wider text-muted-foreground/50 mb-1 block">
                Command Name
              </label>
              <div className="flex items-center gap-0">
                <span className="text-sm text-muted-foreground/60 font-mono pr-1">
                  /
                </span>
                <Input
                  value={commandName}
                  onChange={(e) =>
                    setCommandName(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "")
                        .slice(0, 40),
                    )
                  }
                  placeholder="my-workflow"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-meta uppercase tracking-wider text-muted-foreground/50 mb-1 block">
                Description
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="One-line description of what this command does"
                className="h-8 text-xs"
              />
            </div>

            {/* Activation context */}
            <div>
              <label className="text-meta uppercase tracking-wider text-muted-foreground/50 mb-1 block">
                Activation Context
              </label>
              <Textarea
                value={activationContext}
                onChange={(e) => setActivationContext(e.target.value)}
                placeholder="Describe when this command should be used..."
                className="text-xs min-h-[120px] resize-y"
              />
              <p className="text-micro text-text-tertiary mt-1">
                Tells Claude when to suggest this command
              </p>
            </div>

            {/* Auto-create skill toggle */}
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autoSkill}
                onChange={(e) => setAutoSkill(e.target.checked)}
                className="rounded border-border"
              />
              Sync as skill{commandName.trim() ? <> — creates <span className="font-mono">/{commandName.trim()}</span> on save</> : " on save"}
            </label>
          </div>
        )}

        <DialogFooter className="gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1 mr-auto"
            onClick={handleRegenerate}
            disabled={suggest.isPending}
          >
            <RefreshCw
              size={10}
              className={suggest.isPending ? "animate-spin" : ""}
            />
            Regenerate
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Skip
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={handleSave}
            disabled={!commandName.trim() || isLoading}
          >
            <Terminal size={10} />
            Save &amp; Create Skill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
