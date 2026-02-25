"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Server } from "lucide-react";
import type { ConfigProvider } from "@/types/provider";

const POPULAR_MCP = [
  {
    name: "memory",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    label: "Memory",
  },
  {
    name: "filesystem",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
    label: "Filesystem",
  },
  {
    name: "github",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    label: "GitHub",
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" },
  },
  {
    name: "brave-search",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    label: "Brave Search",
    env: { BRAVE_API_KEY: "" },
  },
];

interface AddMCPDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  provider?: ConfigProvider;
}

export function AddMCPDialog({
  open,
  onClose,
  onSuccess,
  provider = "claude",
}: AddMCPDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"url" | "command">("url");
  const [url, setUrl] = useState("");
  const [headersJson, setHeadersJson] = useState("");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [envJson, setEnvJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const prefillPreset = (preset: (typeof POPULAR_MCP)[number]) => {
    setName(preset.name);
    setType("command");
    setCommand(preset.command);
    setArgsText(preset.args.join("\n"));
    if (preset.env) setEnvJson(JSON.stringify(preset.env, null, 2));
  };

  const reset = () => {
    setName("");
    setType("url");
    setUrl("");
    setHeadersJson("");
    setCommand("");
    setArgsText("");
    setEnvJson("");
    setError("");
  };

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

      const res = await fetch(`/api/tools/mcp?provider=${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          ...(type === "url"
            ? { url: url.trim(), headers }
            : { command: command.trim(), args, env }),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add server");
        setSaving(false);
        return;
      }

      reset();
      onSuccess();
      onClose();
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Add MCP Server</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5 pb-3 border-b border-border/50">
          {POPULAR_MCP.map((preset) => (
            <button
              key={preset.name}
              onClick={() => prefillPreset(preset)}
              className="flex items-center gap-1 px-2.5 py-1 text-meta font-mono rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30 transition-colors"
            >
              <Server size={10} />
              {preset.label}
            </button>
          ))}
        </div>

        <div className="space-y-6">
          <div>
            <label className="text-meta uppercase tracking-wider text-muted-foreground">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-mcp-server"
              className="h-8 text-xs font-mono mt-1"
            />
          </div>

          <div>
            <label className="text-meta uppercase tracking-wider text-muted-foreground">
              Type
            </label>
            <Select
              value={type}
              onValueChange={(v: "url" | "command") => setType(v)}
            >
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="url">URL (Streamable HTTP)</SelectItem>
                <SelectItem value="command">Command (stdio)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "url" ? (
            <>
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
                  Headers (JSON, optional)
                </label>
                <Textarea
                  value={headersJson}
                  onChange={(e) => setHeadersJson(e.target.value)}
                  placeholder='{"x-api-key": "..."}'
                  className="min-h-[60px] text-xs font-mono mt-1"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Command
                </label>
                <Input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx -y @modelcontextprotocol/server-memory"
                  className="h-8 text-xs font-mono mt-1"
                />
              </div>
              <div>
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Args (one per line, optional)
                </label>
                <Textarea
                  value={argsText}
                  onChange={(e) => setArgsText(e.target.value)}
                  placeholder={"--port\n3000"}
                  className="min-h-[60px] text-xs font-mono mt-1"
                />
              </div>
              <div>
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Env (JSON, optional)
                </label>
                <Textarea
                  value={envJson}
                  onChange={(e) => setEnvJson(e.target.value)}
                  placeholder='{"API_KEY": "..."}'
                  className="min-h-[60px] text-xs font-mono mt-1"
                />
              </div>
            </>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!name.trim() || saving}
            >
              {saving ? "Adding..." : "Add Server"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
