"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInstallPackage } from "@/hooks/useMarketplace";
import { useInvalidateTools } from "@/hooks/useTools";

interface AddPluginDialogProps {
  open: boolean;
  onClose: () => void;
}

function parseInput(raw: string): {
  type: string;
  url: string;
  name: string;
  config?: Record<string, unknown>;
} {
  const trimmed = raw.trim();

  // npx command: "npx -y @scope/pkg" or "npx @scope/pkg --flag"
  if (trimmed.startsWith("npx ")) {
    const parts = trimmed.split(/\s+/).slice(1); // drop "npx"
    const name = (parts.find((p) => !p.startsWith("-")) ?? "mcp-server")
      .replace(/^@[^/]+\//, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-");
    return {
      type: "mcp-server",
      url: "",
      name,
      config: { command: "npx", args: parts },
    };
  }

  // Bare npm package: "@scope/pkg" or "some-package"
  if (!trimmed.includes("://") && !trimmed.includes(" ")) {
    const name = trimmed
      .replace(/^@[^/]+\//, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-");
    return {
      type: "mcp-server",
      url: "",
      name,
      config: { command: "npx", args: ["-y", trimmed] },
    };
  }

  // GitHub URL (default)
  const name =
    trimmed
      .split("/")
      .pop()
      ?.replace(/\.git$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "") || "plugin";
  return { type: "plugin", url: trimmed, name };
}

export function AddPluginDialog({ open, onClose }: AddPluginDialogProps) {
  const [input, setInput] = useState("");
  const invalidateTools = useInvalidateTools();
  const installMutation = useInstallPackage({
    onPluginInstalled: () => invalidateTools(),
  });

  const handleInstall = () => {
    if (!input.trim()) return;
    installMutation.mutate(parseInput(input));
    setInput("");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setInput("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Add Plugin</DialogTitle>
        </DialogHeader>

        <div>
          <label className="text-meta uppercase tracking-wider text-muted-foreground">
            GitHub URL, npm package, or npx command
          </label>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleInstall();
            }}
            placeholder="npx -y @scope/server or github.com/owner/repo"
            className="h-8 text-xs font-mono mt-1"
            autoFocus
          />
          <p className="text-[10px] text-muted-foreground/60 mt-1.5">
            Paste a GitHub URL, an npm package name, or an npx command
          </p>
        </div>

        <DialogFooter className="flex items-center sm:justify-between">
          <Button variant="outline" size="sm" className="text-xs" asChild>
            <Link href="/marketplace?type=plugin">Browse Marketplace</Link>
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setInput("");
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleInstall}
              disabled={!input.trim() || installMutation.isPending}
            >
              {installMutation.isPending ? "Installing..." : "Install"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
