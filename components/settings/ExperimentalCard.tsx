"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SettingRow } from "./SettingRow";
import type { ClaudeSettings } from "@/lib/claude-settings";

interface ExperimentalCardProps {
  settings: ClaudeSettings;
  onUpdate: (partial: Partial<ClaudeSettings>) => Promise<void>;
}

export function ExperimentalCard({
  settings,
  onUpdate,
}: ExperimentalCardProps) {
  const envVars = (settings.env || {}) as Record<string, string>;

  return (
    <Card className="card-hover-glow border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          Experimental
          <Badge
            variant="outline"
            className="text-yellow-500 dark:text-yellow-400 border-yellow-500/40 text-[10px] px-1.5 py-0"
          >
            Beta
          </Badge>
        </CardTitle>
        <CardDescription>
          Features that are still in development.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SettingRow
          label="Agent teams"
          description="Enable multi-agent team coordination (swarm mode). A lead agent can delegate tasks to parallel teammates."
        >
          <Switch
            checked={envVars.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1"}
            onCheckedChange={(checked) =>
              onUpdate({
                env: {
                  ...envVars,
                  CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: checked ? "1" : "0",
                },
              })
            }
          />
        </SettingRow>
      </CardContent>
    </Card>
  );
}
