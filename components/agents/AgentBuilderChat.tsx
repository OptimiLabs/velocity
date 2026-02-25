"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sparkles, Send, Loader2, Square, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useAgentBuilderChat,
  type ChatMessage,
  type AgentBuilderChatProvider,
} from "@/hooks/useAgentBuilderChat";
import { AgentConfigPanel } from "./AgentConfigPanel";
import { ProviderTargetModeSelector } from "@/components/providers/ProviderTargetModeSelector";
import { ArtifactConvertDialog } from "@/components/providers/ArtifactConvertDialog";
import { DirectoryPicker } from "@/components/console/DirectoryPicker";
import type { Agent } from "@/types/agent";
import type { AIProvider } from "@/types/instructions";
import type { ProviderTargetMode } from "@/types/provider-artifacts";

interface ToolInfo {
  name: string;
  type: "builtin" | "mcp" | "plugin" | "skill";
  description?: string;
}

type ProviderListItem = Omit<AIProvider, "apiKeyEncrypted">;

interface ChatProviderOption {
  key: AgentBuilderChatProvider;
  label: string;
}

interface ProjectItem {
  id: string;
  name: string;
  path: string;
}

function isProjectItem(row: unknown): row is ProjectItem {
  return (
    !!row &&
    typeof row === "object" &&
    typeof (row as { id?: unknown }).id === "string" &&
    typeof (row as { name?: unknown }).name === "string" &&
    typeof (row as { path?: unknown }).path === "string"
  );
}

interface AgentBuilderChatProps {
  open: boolean;
  onClose: () => void;
  onSave: (agent: Partial<Agent>) => void;
  initialAgent?: Partial<Agent>;
  existingAgents?: { name: string; description: string }[];
  mode?: "create" | "edit";
  hideScope?: boolean;
  title?: string;
  actionLabel?: string;
}

/** Strips ```agent-config blocks for display in chat */
function stripConfigBlocks(text: string): string {
  return text.replace(/```agent-config\s*\n[\s\S]*?```/g, "").trim();
}

export function AgentBuilderChat({
  open,
  onClose,
  onSave,
  initialAgent,
  existingAgents,
  mode = "create",
  hideScope = mode === "edit",
  title,
  actionLabel,
}: AgentBuilderChatProps) {
  const {
    messages,
    currentConfig,
    configStatus,
    configWarnings,
    configErrors,
    repairNotes,
    isStreaming,
    streamingText,
    sendMessage,
    updateConfig,
    stopStreaming,
    repairConfig,
    reset,
  } = useAgentBuilderChat(existingAgents);

  const [inputValue, setInputValue] = useState("");
  const [availableTools, setAvailableTools] = useState<ToolInfo[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [providerOptions, setProviderOptions] = useState<ChatProviderOption[]>([
    { key: "claude-cli", label: "Claude CLI" },
  ]);
  const [selectedProvider, setSelectedProvider] =
    useState<AgentBuilderChatProvider>("claude-cli");
  const [outputTargetProvider, setOutputTargetProvider] =
    useState<ProviderTargetMode>("claude");
  const [saveScope, setSaveScope] = useState<"global" | "project">("global");
  const [saveProjectPath, setSaveProjectPath] = useState("");
  const [saveAreaPath, setSaveAreaPath] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch available tools
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    fetch("/api/tools")
      .then((r) => r.json())
      .then((tools: ToolInfo[]) => {
        if (!cancelled) setAvailableTools(tools);
      })
      .catch((err) => console.warn("[AGENTS]", err.message));

    fetch("/api/instructions/providers")
      .then((r) => r.json())
      .then((rows: ProviderListItem[] | unknown) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? (rows as ProviderListItem[]) : [];
        const options: ChatProviderOption[] = [{ key: "claude-cli", label: "Claude CLI" }];
        const seen = new Set<ChatProviderOption["key"]>(["claude-cli"]);
        for (const row of list) {
          if (!row?.isActive) continue;
          const key = ((row.providerSlug || row.provider) as AgentBuilderChatProvider);
          if (
            key !== "anthropic" &&
            key !== "openai" &&
            key !== "google" &&
            key !== "openrouter" &&
            key !== "local" &&
            key !== "custom"
          ) {
            continue;
          }
          if (seen.has(key)) continue;
          seen.add(key);
          options.push({ key, label: row.displayName || key });
        }
        setProviderOptions(options);
        setSelectedProvider((prev) =>
          options.some((option) => option.key === prev) ? prev : "claude-cli",
        );
      })
      .catch((err) => console.warn("[AGENTS]", err.message));

    fetch("/api/projects?limit=200")
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        const rows = Array.isArray(payload?.projects)
          ? payload.projects
          : Array.isArray(payload)
            ? payload
            : [];
        const mapped = (rows as unknown[])
          .filter(isProjectItem)
          .map((row) => ({ id: row.id, name: row.name, path: row.path }));
        setProjects(mapped);
        setSaveProjectPath((prev) =>
          prev ? prev : mapped.length === 1 ? mapped[0]?.path || "" : "",
        );
      })
      .catch((err) => console.warn("[AGENTS]", err.message));

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      reset();
      setInputValue("");
      setSelectedProvider("claude-cli");
      setOutputTargetProvider("claude");
      setSaveScope("global");
      setSaveProjectPath("");
      setSaveAreaPath("");
      setConvertOpen(false);
      onClose();
    }
  };

  // Track if we have applied initial config for this dialog session
  const initialApplied = useRef(false);
  useEffect(() => {
    if (open && initialAgent && !initialApplied.current) {
      initialApplied.current = true;
      updateConfig(initialAgent);
    }
    if (!open) {
      initialApplied.current = false;
    }
  }, [open, initialAgent, updateConfig]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSend = () => {
    if (!inputValue.trim() || isStreaming) return;
    sendMessage(inputValue.trim(), selectedProvider);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCreate = () => {
    if (!currentConfig.name || !currentConfig.prompt) return;
    if (!hideScope && saveScope === "project" && !saveProjectPath) {
      toast.error("Select a project before saving a project-scoped agent");
      return;
    }
    const payload: Partial<Agent> = {
      ...currentConfig,
      ...(!hideScope
        ? {
            scope: saveScope,
            ...(saveScope === "project" ? { projectPath: saveProjectPath } : {}),
            ...(saveScope === "project" && saveAreaPath.trim()
              ? { areaPath: saveAreaPath.trim() }
              : {}),
          }
        : {}),
    };
    onSave(payload);
    onClose();
  };

  const canCreate =
    !!(currentConfig.name && currentConfig.prompt) &&
    (hideScope || saveScope === "global" || !!saveProjectPath);
  const primaryActionLabel =
    actionLabel ?? (mode === "edit" ? "Apply" : "Create");
  const displayStreamingText = streamingText
    ? stripConfigBlocks(streamingText)
    : "";

  const statusTone =
    configStatus === "valid"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : configStatus === "repaired"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
        : configStatus === "invalid"
          ? "bg-destructive/10 text-destructive border-destructive/30"
          : "bg-muted text-muted-foreground border-border/40";
  const statusLabel =
    configStatus === "valid"
      ? "Config valid"
      : configStatus === "repaired"
        ? "Config repaired"
        : configStatus === "invalid"
          ? "Config needs repair"
          : "Awaiting config";

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b border-border/50 flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <DialogTitle className="text-xs flex items-center gap-1.5">
              <Sparkles size={12} className="text-chart-4" />
              {title ?? (mode === "edit" ? "AI Edit Agent" : "New Agent")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Chat with AI to iteratively design an agent configuration and save
              the generated agent.
            </DialogDescription>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="uppercase tracking-wider">Provider</span>
              <select
                value={selectedProvider}
                onChange={(e) =>
                  setSelectedProvider(e.target.value as AgentBuilderChatProvider)
                }
                className="h-6 rounded border border-border/50 bg-background px-2 text-[11px] text-foreground"
                disabled={isStreaming}
                aria-label="LLM provider"
              >
                {providerOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="uppercase tracking-wider">Output</span>
              <ProviderTargetModeSelector
                value={outputTargetProvider}
                onChange={setOutputTargetProvider}
                disabled={isStreaming}
                includeAll
                className="h-6 min-w-[120px] text-[11px]"
                ariaLabel="Agent chat output provider"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn("text-[10px] h-6 px-2 border", statusTone)}
            >
              {statusLabel}
            </Badge>
            {configStatus === "invalid" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  if (!repairConfig()) {
                    toast.error("Unable to repair config from the last response");
                  } else {
                    toast.success("Applied best-effort config repair");
                  }
                }}
                disabled={isStreaming}
              >
                Apply Repair
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                if (!canCreate) return;
                setConvertOpen(true);
                if (outputTargetProvider !== "claude") {
                  toast.success("Provider conversion outputs are ready");
                }
              }}
              disabled={!canCreate || isStreaming}
            >
              Convert
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleCreate}
              disabled={!canCreate || isStreaming}
            >
              {primaryActionLabel}
            </Button>
          </div>
        </DialogHeader>

        {/* Two-column layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Chat (55%) */}
          <div className="w-[55%] flex flex-col border-r border-border/50">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.length === 0 && !isStreaming && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
                  <Sparkles size={24} className="text-muted-foreground/20" />
                  <p className="text-xs text-muted-foreground/50">
                    Describe the agent you want to create
                  </p>
                  <p className="text-[10px] text-text-quaternary max-w-[280px]">
                    e.g. &quot;Create an agent that reviews PRs for security
                    vulnerabilities&quot;
                  </p>
                </div>
              )}

              {messages.map((msg, i) => (
                <MessageBubble key={i} message={msg} />
              ))}

              {/* Streaming indicator */}
              {isStreaming && displayStreamingText && (
                <div className="flex gap-2">
                  <div className="shrink-0 w-5 h-5 rounded-full bg-chart-4/10 flex items-center justify-center mt-0.5">
                    <Bot size={10} className="text-chart-4" />
                  </div>
                  <div className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap min-w-0">
                    {displayStreamingText}
                    <span className="inline-block w-1.5 h-3 bg-foreground/50 animate-pulse ml-0.5" />
                  </div>
                </div>
              )}

              {isStreaming && !displayStreamingText && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                  <Loader2 size={12} className="animate-spin" />
                  Thinking...
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border/30">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    messages.length === 0
                      ? "Describe what this agent should do..."
                      : "Refine the agent..."
                  }
                  className="h-8 text-xs flex-1"
                  disabled={isStreaming}
                />
                {isStreaming ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={stopStreaming}
                  >
                    <Square size={12} />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={handleSend}
                    disabled={!inputValue.trim()}
                  >
                    <Send size={12} />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Config Panel (45%) */}
          <div className="w-[45%] overflow-y-auto p-3 bg-muted/20">
            {(configErrors.length > 0 || configWarnings.length > 0 || repairNotes.length > 0) && (
              <div className="mb-3 space-y-2 rounded-md border border-border/50 bg-background/80 p-2.5">
                {configErrors.length > 0 && (
                  <div className="space-y-1">
                    {configErrors.map((err) => (
                      <div
                        key={`err-${err}`}
                        className="text-[11px] text-destructive"
                      >
                        {err}
                      </div>
                    ))}
                  </div>
                )}
                {repairNotes.length > 0 && (
                  <div className="space-y-1">
                    {repairNotes.map((note) => (
                      <div
                        key={`note-${note}`}
                        className="text-[11px] text-amber-700 dark:text-amber-400"
                      >
                        {note}
                      </div>
                    ))}
                  </div>
                )}
                {configWarnings.length > 0 && (
                  <div className="space-y-1">
                    {configWarnings.map((warn) => (
                      <div
                        key={`warn-${warn}`}
                        className="text-[11px] text-muted-foreground"
                      >
                        {warn}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {Object.keys(currentConfig).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-1">
                <p className="text-xs text-text-tertiary">
                  Agent config will appear here
                </p>
                <p className="text-[10px] text-muted-foreground/25">
                  Start a conversation to generate
                </p>
              </div>
            ) : (
              <AgentConfigPanel
                config={currentConfig}
                onChange={updateConfig}
                availableTools={availableTools}
              />
            )}

            {!hideScope && (
              <div className="mt-3 rounded-md border border-border/50 bg-background/80 p-2.5 space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Save scope
                </div>
                <div className="inline-flex rounded-md border border-input p-0.5 gap-0.5">
                  <button
                    type="button"
                    className={cn(
                      "px-2 py-1 text-xs rounded-sm transition-colors",
                      saveScope === "global"
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setSaveScope("global")}
                    disabled={isStreaming}
                  >
                    Global
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "px-2 py-1 text-xs rounded-sm transition-colors",
                      saveScope === "project"
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setSaveScope("project")}
                    disabled={isStreaming}
                  >
                    Project
                  </button>
                </div>
                {saveScope === "project" && (
                  <div className="space-y-2">
                    <select
                      value={saveProjectPath}
                      onChange={(e) => setSaveProjectPath(e.target.value)}
                      className="h-8 w-full rounded border border-border/50 bg-background px-2 text-xs"
                      disabled={isStreaming}
                    >
                      <option value="">Select a project…</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.path}>
                          {project.name} · {project.path}
                        </option>
                      ))}
                    </select>
                    <DirectoryPicker
                      value={saveProjectPath}
                      onChange={setSaveProjectPath}
                      placeholder="~/projects/my-app"
                      compact
                    />
                    <p className="text-[10px] text-muted-foreground/70">
                      Select an indexed project or enter any project directory.
                    </p>
                    <Input
                      value={saveAreaPath}
                      onChange={(e) => setSaveAreaPath(e.target.value)}
                      placeholder="Project sub-area (optional)"
                      className="h-8 text-xs font-mono"
                      disabled={isStreaming}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <ArtifactConvertDialog
      open={convertOpen}
      onOpenChange={setConvertOpen}
      artifactType="agent"
      sourceProvider={currentConfig.provider ?? "claude"}
      title="Convert Chat Agent Draft"
      description="Preview the current chat-built agent as Claude, Codex, and Gemini outputs."
      getSource={() =>
        currentConfig.name && currentConfig.prompt
          ? {
              kind: "inline" as const,
              data: {
                ...(currentConfig as Record<string, unknown>),
                ...(!hideScope
                  ? {
                      scope: saveScope,
                      projectPath:
                        saveScope === "project" ? saveProjectPath : undefined,
                      areaPath:
                        saveScope === "project" && saveAreaPath.trim()
                          ? saveAreaPath.trim()
                          : undefined,
                    }
                  : {}),
              },
            }
          : null
      }
      defaultTarget={outputTargetProvider}
    />
    </>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className="flex gap-2">
      <div
        className={cn(
          "shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5",
          isUser ? "bg-primary/10" : "bg-chart-4/10",
        )}
      >
        {isUser ? (
          <User size={10} className="text-primary" />
        ) : (
          <Bot size={10} className="text-chart-4" />
        )}
      </div>
      <div
        className={cn(
          "text-xs leading-relaxed whitespace-pre-wrap min-w-0",
          isUser ? "text-foreground" : "text-foreground/80",
        )}
      >
        {message.content}
      </div>
    </div>
  );
}
