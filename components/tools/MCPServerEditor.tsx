"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConfigProvider } from "@/types/provider";

interface MCPServerEditorProps {
  serverName: string;
  config: {
    url?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    headers?: Record<string, string>;
  };
  onSave: () => void;
  onCancel: () => void;
  provider?: ConfigProvider;
}

export function MCPServerEditor({
  serverName,
  config,
  onSave,
  onCancel,
  provider = "claude",
}: MCPServerEditorProps) {
  const [type, setType] = useState<"url" | "command">(
    config.url ? "url" : "command",
  );
  const [url, setUrl] = useState(config.url || "");
  const [headersJson, setHeadersJson] = useState(
    config.headers ? JSON.stringify(config.headers, null, 2) : "",
  );
  const [command, setCommand] = useState(config.command || "");
  const [argsText, setArgsText] = useState(config.args?.join("\n") || "");
  const [envJson, setEnvJson] = useState(
    config.env ? JSON.stringify(config.env, null, 2) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      let headers: Record<string, string> | undefined;
      if (headersJson.trim()) {
        try {
          headers = JSON.parse(headersJson);
        } catch {
          setError("Invalid headers JSON");
          setSaving(false);
          return;
        }
      }

      let env: Record<string, string> | undefined;
      if (envJson.trim()) {
        try {
          env = JSON.parse(envJson);
        } catch {
          setError("Invalid env JSON");
          setSaving(false);
          return;
        }
      }

      const args = argsText.trim()
        ? argsText
            .trim()
            .split("\n")
            .map((a) => a.trim())
            .filter(Boolean)
        : undefined;

      const newConfig: Record<string, unknown> = {};
      if (type === "url") {
        newConfig.url = url.trim();
        if (headers) newConfig.headers = headers;
        // Clear command fields
        newConfig.command = undefined;
        newConfig.args = undefined;
        newConfig.env = undefined;
      } else {
        newConfig.command = command.trim();
        if (args) newConfig.args = args;
        if (env) newConfig.env = env;
        // Clear url fields
        newConfig.url = undefined;
        newConfig.headers = undefined;
      }

      const res = await fetch(`/api/tools/mcp?provider=${provider}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: serverName, config: newConfig }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update server");
        setSaving(false);
        return;
      }

      window.dispatchEvent(new CustomEvent("mcp:restart-sessions"));
      onSave();
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  };

  return (
    <Card className="bg-muted/30 border-chart-1/20 mt-2">
      <CardContent className="p-4 space-y-4">
        <div className="text-xs font-medium text-muted-foreground">
          Editing:{" "}
          <span className="font-mono text-foreground">{serverName}</span>
        </div>

        <div>
          <label className="text-meta uppercase tracking-wider text-muted-foreground">
            Type
          </label>
          <Select
            value={type}
            onValueChange={(v: "url" | "command") => setType(v)}
          >
            <SelectTrigger className="h-8 text-xs mt-1 w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="url">URL (Streamable HTTP)</SelectItem>
              <SelectItem value="command">Command (stdio)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {type === "url" ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-meta uppercase tracking-wider text-muted-foreground">
                URL
              </label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/mcp"
                className="h-8 text-xs font-mono mt-1"
              />
            </div>
            <div>
              <label className="text-meta uppercase tracking-wider text-muted-foreground">
                Headers (JSON)
              </label>
              <Textarea
                value={headersJson}
                onChange={(e) => setHeadersJson(e.target.value)}
                placeholder='{"x-api-key": "..."}'
                className="min-h-[60px] text-xs font-mono mt-1"
              />
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="text-meta uppercase tracking-wider text-muted-foreground">
                Command
              </label>
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="h-8 text-xs font-mono mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Args (one per line)
                </label>
                <Textarea
                  value={argsText}
                  onChange={(e) => setArgsText(e.target.value)}
                  className="min-h-[60px] text-xs font-mono mt-1"
                />
              </div>
              <div>
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Env (JSON)
                </label>
                <Textarea
                  value={envJson}
                  onChange={(e) => setEnvJson(e.target.value)}
                  className="min-h-[60px] text-xs font-mono mt-1"
                />
              </div>
            </div>
          </>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
