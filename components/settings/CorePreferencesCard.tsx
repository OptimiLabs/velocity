"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SettingRow } from "./SettingRow";
import type { AppSettings } from "@/lib/app-settings";

interface CorePreferencesCardProps {
  settings: AppSettings;
  onUpdate: (partial: Partial<AppSettings>) => Promise<void>;
}

export function CorePreferencesCard({
  settings,
  onUpdate,
}: CorePreferencesCardProps) {
  return (
    <Card className="card-hover-glow border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Core Preferences</CardTitle>
        <CardDescription>
          Dashboard-level settings stored separately from provider configs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SettingRow
          label="Auto-archive idle sessions"
          description="Automatically archive console sessions after inactivity."
          controlAlign="end"
        >
          <div className="w-44">
            <Select
              value={String(settings.autoArchiveDays ?? 0)}
              onValueChange={(v) =>
                onUpdate({ autoArchiveDays: parseInt(v, 10) })
              }
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1" className="text-xs">
                  1 day
                </SelectItem>
                <SelectItem value="3" className="text-xs">
                  3 days
                </SelectItem>
                <SelectItem value="7" className="text-xs">
                  7 days
                </SelectItem>
                <SelectItem value="14" className="text-xs">
                  14 days
                </SelectItem>
                <SelectItem value="30" className="text-xs">
                  30 days
                </SelectItem>
                <SelectItem value="0" className="text-xs">
                  Never
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </SettingRow>

        <SettingRow
          label="Auto-load full transcript"
          description="Load all pages by default when opening a session transcript."
          controlAlign="end"
        >
          <Switch
            checked={settings.sessionAutoLoadAll === true}
            onCheckedChange={(checked) =>
              onUpdate({ sessionAutoLoadAll: checked })
            }
          />
        </SettingRow>

        <SettingRow
          label="Compact header mode"
          description="Hide page titles/subtitles and show compact controls only."
          controlAlign="end"
        >
          <Switch
            checked={settings.disableHeaderView === true}
            onCheckedChange={(checked) =>
              onUpdate({ disableHeaderView: checked })
            }
          />
        </SettingRow>
      </CardContent>
    </Card>
  );
}
