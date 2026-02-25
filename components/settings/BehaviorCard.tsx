"use client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SettingRow } from "./SettingRow";
import type { ClaudeSettings } from "@/lib/claude-settings";

interface CardProps {
  settings: ClaudeSettings;
  onUpdate: (partial: Partial<ClaudeSettings>) => Promise<void>;
}

// ── Claude Code Defaults ───────────────────────────────────────────

export function ClaudeDefaultsCard({ settings, onUpdate }: CardProps) {
  return (
    <Card className="card-hover-glow border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          Claude Code Defaults
        </CardTitle>
        <CardDescription>
          Saved to ~/.claude/settings.json — applies to all Claude Code
          sessions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SettingRow
          label="Default effort"
          description="Reasoning effort level for responses."
        >
          <div className="w-48">
            <Select
              value={settings.effortLevel || "medium"}
              onValueChange={(v) =>
                onUpdate({
                  effortLevel: v as "low" | "medium" | "high",
                })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low" className="text-xs">
                  Low
                </SelectItem>
                <SelectItem value="medium" className="text-xs">
                  Medium
                </SelectItem>
                <SelectItem value="high" className="text-xs">
                  High
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </SettingRow>

        <SettingRow
          label="Extended thinking"
          description="Enable extended thinking for all sessions."
        >
          <Switch
            checked={!!settings.alwaysThinkingEnabled}
            onCheckedChange={(checked) =>
              onUpdate({ alwaysThinkingEnabled: checked })
            }
          />
        </SettingRow>

        <SettingRow
          label="Show turn duration"
          description="Display time taken for each turn."
        >
          <Switch
            checked={!!settings.showTurnDuration}
            onCheckedChange={(checked) =>
              onUpdate({ showTurnDuration: checked })
            }
          />
        </SettingRow>
      </CardContent>
    </Card>
  );
}

// ── App Preferences ────────────────────────────────────────────────

export function AppPreferencesCard({ settings, onUpdate }: CardProps) {
  return (
    <Card className="card-hover-glow border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">
          Claude Behavior
        </CardTitle>
        <CardDescription>
          Claude-side defaults saved to ~/.claude/settings.json.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SettingRow
          label="Output style"
          description="Controls verbosity of Claude responses."
        >
          <div className="w-48">
            <Select
              value={(settings.outputStyle as string) || "default"}
              onValueChange={(v) =>
                onUpdate({ outputStyle: v === "default" ? undefined : v })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default" className="text-xs">
                  Default
                </SelectItem>
                <SelectItem value="concise" className="text-xs">
                  Concise
                </SelectItem>
                <SelectItem value="explanatory" className="text-xs">
                  Explanatory
                </SelectItem>
                <SelectItem value="verbose" className="text-xs">
                  Verbose
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </SettingRow>

        <SettingRow
          label="Respect .gitignore"
          description="Exclude gitignored files from tool operations."
        >
          <Switch
            checked={!!settings.respectGitignore}
            onCheckedChange={(checked) =>
              onUpdate({ respectGitignore: checked })
            }
          />
        </SettingRow>
      </CardContent>
    </Card>
  );
}
