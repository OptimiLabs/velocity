"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SettingRow } from "./SettingRow";

interface SessionMaintenanceCardProps {
  isCompressingAll: boolean;
  onCompressAllSessions: () => Promise<void>;
}

export function SessionMaintenanceCard({
  isCompressingAll,
  onCompressAllSessions,
}: SessionMaintenanceCardProps) {
  return (
    <Card className="card-hover-glow border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Session Maintenance</CardTitle>
        <CardDescription>
          Bulk actions for existing session records.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Compressing all sessions applies to every provider/project and hides
          them from default session views until restored.
        </div>
        <SettingRow
          label="Compress all sessions"
          description="Marks all sessions as compressed in the index. No transcript files, analytics metrics, or usage history are deleted."
          controlAlign="end"
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => {
              void onCompressAllSessions();
            }}
            disabled={isCompressingAll}
          >
            {isCompressingAll ? "Compressing..." : "Compress All Sessions"}
          </Button>
        </SettingRow>
        <p className="text-xs text-muted-foreground">
          Compression never deletes analytics, usage metrics, cost history, or
          session transcript files.
        </p>
      </CardContent>
    </Card>
  );
}
