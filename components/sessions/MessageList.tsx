"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import {
  User,
  Bot,
  Wrench,
  ChevronDown,
  ChevronRight,
  Brain,
  FileText,
  FilePen,
  Search,
  FileSearch,
  Globe,
  GitBranch,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { MarkdownContent } from "./MarkdownContent";
import { CodeBlock } from "./CodeBlock";
import { CopyButton } from "./CopyButton";
import { calculateCost, formatCost } from "@/lib/cost/calculator";
import {
  getUsageBreakdownFromRecord,
  getUsageCostUsd,
  getUsageTotalTokens,
  mergeStreamingTranscriptMessages,
} from "@/lib/sessions/transcript-normalizer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: unknown;
  content?: string | Array<{ type: string; text?: string }>;
  tool_use_id?: string;
  result?: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
  _toolName?: string;
  [key: string]: unknown;
}

interface Message {
  type: string;
  uuid?: string;
  message?: {
    id?: string;
    role: string;
    content: string | ContentBlock[];
    model?: string;
    usage?: Record<string, unknown>;
  };
  timestamp?: string;
  slug?: string;
  _absorbed?: boolean;
  [key: string]: unknown;
}

function flattenMessageText(msg: Message): string {
  if (!msg.message) return "";
  const { content } = msg.message;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block.text === "string") parts.push(block.text);
    if (typeof block.thinking === "string") parts.push(block.thinking);
    if (typeof block.name === "string") parts.push(block.name);
    if (block.input) {
      try {
        parts.push(
          typeof block.input === "string"
            ? block.input
            : JSON.stringify(block.input),
        );
      } catch {
        // ignore non-serializable inputs
      }
    }
    if (block.result) {
      try {
        parts.push(
          typeof block.result === "string"
            ? block.result
            : JSON.stringify(block.result),
        );
      } catch {
        // ignore non-serializable results
      }
    }
  }
  return parts.join("\n");
}

const TOOL_ICONS: Record<string, typeof Wrench> = {
  Read: FileText,
  Write: FilePen,
  Edit: FilePen,
  Bash: TerminalIcon,
  Glob: Search,
  Grep: FileSearch,
  WebFetch: Globe,
  WebSearch: Search,
  Task: GitBranch,
};

const TOOL_COLORS: Record<
  string,
  { text: string; border: string; bg: string; hover: string }
> = {
  Bash: {
    text: "text-emerald-400 dark:text-emerald-300",
    border: "border-emerald-400/20 dark:border-emerald-400/35",
    bg: "bg-emerald-400/5 dark:bg-emerald-400/10",
    hover: "hover:bg-emerald-500/10 dark:hover:bg-emerald-500/15",
  },
  Read: {
    text: "text-blue-400 dark:text-blue-300",
    border: "border-blue-400/20 dark:border-blue-400/35",
    bg: "bg-blue-400/5 dark:bg-blue-400/10",
    hover: "hover:bg-blue-500/10 dark:hover:bg-blue-500/15",
  },
  Glob: {
    text: "text-blue-400 dark:text-blue-300",
    border: "border-blue-400/20 dark:border-blue-400/35",
    bg: "bg-blue-400/5 dark:bg-blue-400/10",
    hover: "hover:bg-blue-500/10 dark:hover:bg-blue-500/15",
  },
  Grep: {
    text: "text-blue-400 dark:text-blue-300",
    border: "border-blue-400/20 dark:border-blue-400/35",
    bg: "bg-blue-400/5 dark:bg-blue-400/10",
    hover: "hover:bg-blue-500/10 dark:hover:bg-blue-500/15",
  },
  Write: {
    text: "text-amber-400 dark:text-amber-300",
    border: "border-amber-400/20 dark:border-amber-400/35",
    bg: "bg-amber-400/5 dark:bg-amber-400/10",
    hover: "hover:bg-amber-500/10 dark:hover:bg-amber-500/15",
  },
  Edit: {
    text: "text-amber-400 dark:text-amber-300",
    border: "border-amber-400/20 dark:border-amber-400/35",
    bg: "bg-amber-400/5 dark:bg-amber-400/10",
    hover: "hover:bg-amber-500/10 dark:hover:bg-amber-500/15",
  },
  WebFetch: {
    text: "text-violet-400 dark:text-violet-300",
    border: "border-violet-400/20 dark:border-violet-400/35",
    bg: "bg-violet-400/5 dark:bg-violet-400/10",
    hover: "hover:bg-violet-500/10 dark:hover:bg-violet-500/15",
  },
  WebSearch: {
    text: "text-violet-400 dark:text-violet-300",
    border: "border-violet-400/20 dark:border-violet-400/35",
    bg: "bg-violet-400/5 dark:bg-violet-400/10",
    hover: "hover:bg-violet-500/10 dark:hover:bg-violet-500/15",
  },
  Task: {
    text: "text-info",
    border: "border-info/20 dark:border-info/35",
    bg: "bg-info/5 dark:bg-info/10",
    hover: "hover:bg-info/10 dark:hover:bg-info/15",
  },
};
const DEFAULT_TOOL_COLOR = {
  text: "text-chart-2",
  border: "border-chart-2/20 dark:border-chart-2/35",
  bg: "bg-chart-2/5 dark:bg-chart-2/10",
  hover: "hover:bg-chart-2/10 dark:hover:bg-chart-2/15",
};

const TOOL_ACTIONS: Record<string, string> = {
  Read: "Read file",
  Write: "Wrote file",
  Edit: "Edited file",
  Bash: "Ran command",
  Glob: "Searched files",
  Grep: "Searched content",
  WebFetch: "Fetched URL",
  WebSearch: "Searched web",
  Task: "Spawned agent",
  NotebookEdit: "Edited notebook",
};

function getToolSummary(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const inp = input as Record<string, unknown>;
  switch (name) {
    case "Read":
    case "Write":
    case "Edit":
    case "NotebookEdit":
      return typeof inp.file_path === "string"
        ? inp.file_path.split("/").slice(-2).join("/")
        : typeof inp.notebook_path === "string"
          ? inp.notebook_path.split("/").slice(-2).join("/")
          : "";
    case "Bash":
      if (typeof inp.command === "string") {
        const cmd = inp.command.length > 80 ? inp.command.slice(0, 77) + "..." : inp.command;
        return cmd;
      }
      return "";
    case "Grep":
      return typeof inp.pattern === "string" ? `/${inp.pattern}/` : "";
    case "Glob":
      return typeof inp.pattern === "string" ? inp.pattern : "";
    case "WebFetch":
      return typeof inp.url === "string" ? inp.url : "";
    case "WebSearch":
      return typeof inp.query === "string" ? inp.query : "";
    case "Task":
      return typeof inp.description === "string" ? inp.description : "";
    default:
      return "";
  }
}

function formatModelLabel(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("claude-")) return trimmed.replace(/^claude-/, "");
  return trimmed;
}

function ThinkingBlock({ block }: { block: ContentBlock }) {
  const [expanded, setExpanded] = useState(false);
  const text = block.thinking || block.text || "";
  if (!text) return null;
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 my-1.5 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-3 py-2 w-full text-left text-xs transition-colors hover:bg-muted/40"
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Brain size={11} />
        </div>
        <span className="font-medium text-foreground/90">Thinking</span>
        <span className="text-xs text-muted-foreground ml-1">
          {text.length} chars
        </span>
        {expanded ? (
          <ChevronDown size={12} className="ml-auto text-muted-foreground" />
        ) : (
          <ChevronRight size={12} className="ml-auto text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-border/40 px-3 py-2.5 text-xs text-muted-foreground whitespace-pre-wrap max-h-96 overflow-y-auto bg-background/40">
          {text}
        </div>
      )}
    </div>
  );
}

function ToolCallBlock({
  block,
  allocatedTokens,
  allocatedCost,
  allocatedCostIsEstimated,
}: {
  block: ContentBlock;
  allocatedTokens?: number | null;
  allocatedCost?: number | null;
  allocatedCostIsEstimated?: boolean;
}) {
  const [inputExpanded, setInputExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);
  const toolName = block.name || "unknown";
  const Icon = TOOL_ICONS[toolName] || Wrench;
  const colors = TOOL_COLORS[toolName] || DEFAULT_TOOL_COLOR;
  const action = TOOL_ACTIONS[toolName] || "Tool call";
  const summary = getToolSummary(toolName, block.input);

  const inputStr =
    block.input != null
      ? typeof block.input === "string"
        ? block.input
        : JSON.stringify(block.input, null, 2)
      : "";

  const resultContent =
    typeof block.result === "string"
      ? block.result
      : Array.isArray(block.result)
        ? block.result.map((c) => c.text || "").join("\n")
        : "";

  const hasResult = resultContent.length > 0;

  return (
    <div
      className={cn(
        "group rounded-xl border my-1.5 overflow-hidden shadow-sm",
        colors.border,
        colors.bg,
      )}
    >
      {/* Header: tool name + action + summary */}
      <div className={cn("px-3 py-2 flex items-center gap-2 text-xs")}>
        <Icon size={12} className={cn(colors.text, "shrink-0")} />
        <span className={cn("font-mono font-medium", colors.text)}>
          {toolName}
        </span>
        <span className="text-muted-foreground/50">&middot;</span>
        <span className="text-muted-foreground">{action}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {typeof allocatedTokens === "number" && allocatedTokens > 0 && (
            <span
              className="tabular-nums rounded-full border border-border/35 bg-background/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              title="Allocated token usage for this tool call."
            >
              {allocatedTokens.toLocaleString()} tok
            </span>
          )}
          {typeof allocatedCost === "number" && allocatedCost >= 0 && (
            <span
              className="tabular-nums rounded-full border border-border/35 bg-background/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              title={
                allocatedCostIsEstimated
                  ? "Estimated from model pricing and allocated across tool calls in this assistant turn."
                  : "Reported usage cost allocated across tool calls in this assistant turn."
              }
            >
              {allocatedCostIsEstimated ? "~" : ""}
              {formatCost(allocatedCost)}
            </span>
          )}
        </div>
        {block.is_error && (
          <span className="rounded-full border border-destructive/20 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
            error
          </span>
        )}
      </div>

      {/* Smart summary line */}
      {summary && (
        <div className="px-3 pb-2 text-xs font-mono text-muted-foreground/80 truncate">
          {summary}
        </div>
      )}

      {/* Collapsible input */}
      {inputStr && (
        <div className={cn("border-t", colors.border)}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setInputExpanded(!inputExpanded)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setInputExpanded(!inputExpanded); } }}
            className={cn(
              "flex items-center gap-2 px-3 py-1 w-full text-left text-xs cursor-pointer",
              colors.hover,
            )}
          >
            {inputExpanded ? (
              <ChevronDown size={10} className="text-muted-foreground/70" />
            ) : (
              <ChevronRight size={10} className="text-muted-foreground/70" />
            )}
            <span className="text-muted-foreground font-medium">Input</span>
            <CopyButton
              text={inputStr}
              className="ml-1 opacity-0 group-hover:opacity-100"
            />
          </div>
          {inputExpanded && (
            <CodeBlock
              code={inputStr}
              language="json"
              className="px-3 pb-2 text-muted-foreground overflow-x-auto max-h-60 overflow-y-auto bg-background/30"
            />
          )}
        </div>
      )}

      {/* Collapsible result (same color scheme, not gray!) */}
      {hasResult && (
        <div className={cn("border-t", colors.border)}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setResultExpanded(!resultExpanded)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setResultExpanded(!resultExpanded); } }}
            className={cn(
              "flex items-center gap-2 px-3 py-1 w-full text-left text-xs cursor-pointer",
              colors.hover,
            )}
          >
            {resultExpanded ? (
              <ChevronDown size={10} className="text-muted-foreground/70" />
            ) : (
              <ChevronRight size={10} className="text-muted-foreground/70" />
            )}
            <span
              className={cn(
                "font-medium",
                block.is_error
                  ? "text-destructive/80"
                  : "text-muted-foreground",
              )}
            >
              Result
            </span>
            <span className="text-muted-foreground/70 text-xs">
              {resultContent.length.toLocaleString()} chars
            </span>
            <CopyButton
              text={resultContent}
              className="ml-1 opacity-0 group-hover:opacity-100"
            />
          </div>
          {resultExpanded &&
            (block.is_error ? (
              <pre className="px-3 pb-2 text-xs font-mono overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap text-destructive/70 dark:text-destructive">
                {resultContent}
              </pre>
            ) : (
              <CodeBlock
                code={resultContent}
                className="px-3 pb-2 text-muted-foreground overflow-x-auto max-h-60 overflow-y-auto bg-background/30"
              />
            ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  if (!msg.message) return null;

  // Hide absorbed messages (tool results now shown inline in ToolCallBlock)
  if (msg._absorbed) return null;

  const { role, content, model, usage } = msg.message;
  const isUser = role === "user";

  // Fallback for unabsorbed tool_result messages (e.g. page boundaries)
  const contentBlocks = Array.isArray(content) ? content : [];
  const isToolResult =
    isUser &&
    contentBlocks.length > 0 &&
    contentBlocks.every((b) => b.type === "tool_result");

  if (isToolResult) {
    return (
      <div className="pl-8">
        {contentBlocks.map((block, i) => (
          <ToolCallBlock
            key={i}
            block={{
              ...block,
              type: "tool_use",
              name: block._toolName || "unknown",
              result: block.content,
              is_error: block.is_error,
            }}
          />
        ))}
      </div>
    );
  }

  const textContent =
    typeof content === "string"
      ? content
      : contentBlocks
          .filter((b) => b.type === "text")
          .map((b) => b.text || "")
          .join("\n");

  const toolUseBlocks = contentBlocks.filter((b) => b.type === "tool_use");
  const thinkingBlocks = contentBlocks.filter((b) => b.type === "thinking");
  const usageRecord =
    usage && typeof usage === "object"
      ? (usage as Record<string, unknown>)
      : undefined;
  const usageBreakdown = getUsageBreakdownFromRecord(usageRecord);
  const usageTotal = getUsageTotalTokens(usageRecord);
  const usageCost = getUsageCostUsd(usageRecord);
  const estimatedCost =
    model
      ? calculateCost(
          model,
          usageBreakdown.input,
          usageBreakdown.output,
          usageBreakdown.cacheRead,
          usageBreakdown.cacheWrite,
        )
      : null;
  const messageCost = usageCost ?? estimatedCost;
  const messageCostIsEstimated = usageCost === null;
  const toolUsageCount = toolUseBlocks.length;
  const perToolTokens =
    toolUsageCount > 0 && usageTotal > 0
      ? Math.round(usageTotal / toolUsageCount)
      : null;
  const perToolCost =
    toolUsageCount > 0 && messageCost !== null
      ? messageCost / toolUsageCount
      : null;

  return (
    <div className={cn("flex gap-3 group", isUser ? "flex-row-reverse" : "")}>
      <div
        className={cn(
          "w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 mt-0.5",
          isUser
            ? "bg-primary/10 text-primary border-primary/20"
            : "bg-background/70 text-foreground/80 border-border/50",
        )}
      >
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>

      <div
        className={cn(
          "flex-1 min-w-0 space-y-1.5 break-words",
          isUser ? "text-right" : "",
        )}
      >
        <div
          className={cn(
            "flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground",
            isUser ? "justify-end" : "",
          )}
        >
          <span className="font-medium text-foreground/85">
            {isUser ? "You" : "Assistant"}
          </span>
          {model && (
            <span className="rounded-full border border-border/40 bg-background/60 px-1.5 py-0.5 font-mono">
              {formatModelLabel(model)}
            </span>
          )}
          {usageRecord && (
            <span className="tabular-nums rounded-full border border-border/40 bg-background/60 px-1.5 py-0.5">
              {usageTotal.toLocaleString()}{" "}
              tok
            </span>
          )}
          {typeof messageCost === "number" && (
            <span
              className="tabular-nums rounded-full border border-border/40 bg-background/60 px-1.5 py-0.5"
              title={
                messageCostIsEstimated
                  ? "Estimated from model pricing and token usage."
                  : "Reported usage cost."
              }
            >
              {messageCostIsEstimated ? "~" : ""}
              {formatCost(messageCost)}
            </span>
          )}
          {msg.timestamp && (
            <span className="text-muted-foreground/80">
              {format(new Date(msg.timestamp), "HH:mm:ss")}
            </span>
          )}
          {textContent && (
            <CopyButton
              text={textContent}
              className="opacity-0 group-hover:opacity-100"
            />
          )}
        </div>

        {thinkingBlocks.map((block, i) => (
          <ThinkingBlock key={i} block={block} />
        ))}

        {textContent && (
          <div
            className={cn(
              "w-full rounded-2xl border px-3.5 py-2.5 text-left shadow-sm break-words",
              isUser
                ? "ml-auto sm:w-[88%] border-primary/20 bg-primary/8"
                : "border-border/50 bg-card/60",
            )}
          >
            <MarkdownContent content={textContent} />
          </div>
        )}

        {toolUseBlocks.map((block, i) => (
          <ToolCallBlock
            key={block.id || i}
            block={block}
            allocatedTokens={perToolTokens}
            allocatedCost={perToolCost}
            allocatedCostIsEstimated={messageCostIsEstimated}
          />
        ))}
      </div>
    </div>
  );
}

type FilterMode =
  | "all"
  | "user-prompts"
  | "thinking"
  | "text-only"
  | { tool: string };

function FilterBar({
  filter,
  setFilter,
  messages,
}: {
  filter: FilterMode;
  setFilter: (f: FilterMode) => void;
  messages: Message[];
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!toolsOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      )
        setToolsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [toolsOpen]);

  const toolCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const msg of messages) {
      if (msg.type !== "assistant" || !msg.message) continue;
      const blocks = Array.isArray(msg.message.content)
        ? msg.message.content
        : [];
      for (const b of blocks) {
        if (b.type === "tool_use" && b.name) {
          counts[b.name] = (counts[b.name] || 0) + 1;
        }
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [messages]);

  const pillCounts = useMemo(() => {
    let userPrompts = 0;
    let thinking = 0;
    let textOnly = 0;
    for (const m of messages) {
      if (!m.message) continue;
      const blocks = Array.isArray(m.message.content) ? m.message.content : [];
      if (m.message.role === "user") {
        const toolResultOnly =
          blocks.length > 0 && blocks.every((b) => b.type === "tool_result");
        if (!toolResultOnly) userPrompts++;
      }
      if (m.message.role === "assistant") {
        const hasThinking = blocks.some((b) => b.type === "thinking");
        if (hasThinking) thinking++;
        const hasText =
          typeof m.message.content === "string"
            ? m.message.content.length > 0
            : blocks.some((b) => b.type === "text" && b.text);
        const hasToolUse = blocks.some((b) => b.type === "tool_use");
        if (hasText && !hasToolUse) textOnly++;
      }
    }
    return {
      all: messages.length,
      "user-prompts": userPrompts,
      thinking,
      "text-only": textOnly,
    } as const;
  }, [messages]);

  const pills: {
    label: string;
    value: Extract<FilterMode, string>;
    count: number;
  }[] = [
    { label: "All", value: "all", count: pillCounts.all },
    { label: "My Prompts", value: "user-prompts", count: pillCounts["user-prompts"] },
    { label: "Thinking", value: "thinking", count: pillCounts.thinking },
    { label: "Text Only", value: "text-only", count: pillCounts["text-only"] },
  ];

  const activeToolName = typeof filter === "object" ? filter.tool : null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 rounded-xl border border-border/50 bg-background/60 p-1">
        {pills.map((p) => (
          <button
            key={p.value}
            onClick={() => setFilter(p.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
              typeof filter === "string" && filter === p.value
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <span>{p.label}</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                typeof filter === "string" && filter === p.value
                  ? "bg-primary/15"
                  : "bg-muted/70 text-muted-foreground",
              )}
            >
              {p.count}
            </span>
          </button>
        ))}
      </div>
      {toolCounts.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setToolsOpen(!toolsOpen)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors",
              activeToolName
                ? "border-primary/30 bg-primary/5 text-primary"
                : "border-border/50 bg-background/60 text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <Wrench size={12} />
            <span className="font-medium">{activeToolName || "Tools"}</span>
            <span className="rounded-full bg-muted/70 px-1.5 py-0.5 text-[10px] tabular-nums">
              {toolCounts.reduce((sum, [, c]) => sum + c, 0)}
            </span>
            <ChevronDown size={10} className="text-muted-foreground" />
          </button>
          {toolsOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 min-w-[220px] max-h-72 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
              <button
                onClick={() => {
                  setFilter("all");
                  setToolsOpen(false);
                }}
                className={cn(
                  "mb-1 w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-muted/50",
                  !activeToolName && "bg-primary/5 text-primary",
                )}
              >
                All tools
              </button>
              {toolCounts.map(([name, count]) => (
                <button
                  key={name}
                  onClick={() => {
                    setFilter({ tool: name });
                    setToolsOpen(false);
                  }}
                  className={cn(
                    "w-full rounded-lg text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center justify-between gap-3",
                    activeToolName === name && "bg-primary/10 text-primary",
                  )}
                >
                  <span className="font-mono truncate">{name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PaginationInfo {
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}

interface MessageListProps {
  messages: Message[];
  pagination?: PaginationInfo;
  onLoadOlder?: () => void;
  loadingOlder?: boolean;
  onLoadAll?: () => void;
  loadingAll?: boolean;
}

export function MessageList({
  messages,
  pagination,
  onLoadOlder,
  loadingOlder,
  onLoadAll,
  loadingAll,
}: MessageListProps) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const mergedMessages = useMemo(
    () => mergeStreamingTranscriptMessages(messages),
    [messages],
  );
  const totalLoadedMessages = mergedMessages.length;
  const effectiveTotal = pagination
    ? Math.max(pagination.total, totalLoadedMessages)
    : totalLoadedMessages;

  const baseMessages = useMemo(() => {
    return mergedMessages.filter(
      (m) =>
        (m.type === "user" || m.type === "assistant") && !m._absorbed,
    );
  }, [mergedMessages]);

  const filteredMessages = useMemo(() => {
    let scoped = baseMessages;

    if (filter === "user-prompts") {
      scoped = scoped.filter((m) => {
        if (m.message?.role !== "user") return false;
        const blocks = Array.isArray(m.message.content)
          ? m.message.content
          : [];
        // Exclude tool_result-only messages
        if (blocks.length > 0 && blocks.every((b) => b.type === "tool_result"))
          return false;
        return true;
      });
    }
    else if (filter === "thinking") {
      scoped = scoped.filter((m) => {
        if (m.message?.role !== "assistant") return false;
        const blocks = Array.isArray(m.message.content)
          ? m.message.content
          : [];
        return blocks.some((b) => b.type === "thinking");
      });
    }
    else if (filter === "text-only") {
      scoped = scoped.filter((m) => {
        if (m.message?.role !== "assistant") return false;
        const blocks = Array.isArray(m.message.content)
          ? m.message.content
          : [];
        const hasText =
          typeof m.message.content === "string"
            ? m.message.content.length > 0
            : blocks.some((b) => b.type === "text" && b.text);
        const hasToolUse = blocks.some((b) => b.type === "tool_use");
        return hasText && !hasToolUse;
      });
    }
    else if (typeof filter === "object") {
      // Tool filter
      scoped = scoped.filter((m) => {
        if (m.message?.role !== "assistant") return false;
        const blocks = Array.isArray(m.message.content)
          ? m.message.content
          : [];
        return blocks.some(
          (b) => b.type === "tool_use" && b.name === filter.tool,
        );
      });
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((m) => flattenMessageText(m).toLowerCase().includes(q));
  }, [baseMessages, filter, searchQuery]);

  const activeFilterLabel = useMemo(() => {
    if (filter === "all") return "All";
    if (filter === "user-prompts") return "My Prompts";
    if (filter === "thinking") return "Thinking";
    if (filter === "text-only") return "Text Only";
    return `Tool: ${filter.tool}`;
  }, [filter]);

  if (baseMessages.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-12">
        No messages in this session.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 rounded-2xl border border-border/50 bg-card/85 backdrop-blur px-3 py-3 shadow-sm space-y-2.5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <FilterBar
            filter={filter}
            setFilter={setFilter}
            messages={baseMessages}
          />
          <div className="relative w-full lg:w-72">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transcript, tools, file paths..."
              className="h-8 pl-7 pr-7 text-xs bg-background/90"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50"
                aria-label="Clear search"
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="rounded-full border border-border/40 bg-background/60 px-2 py-1">
            Showing{" "}
            <span className="tabular-nums text-foreground/90">
              {filteredMessages.length.toLocaleString()}
            </span>{" "}
            of{" "}
            <span className="tabular-nums text-foreground/90">
              {baseMessages.length.toLocaleString()}
            </span>{" "}
            loaded
          </span>
          <span className="rounded-full border border-border/40 bg-background/60 px-2 py-1">
            Filter: {activeFilterLabel}
          </span>
          {pagination && (
            <span className="rounded-full border border-border/40 bg-background/60 px-2 py-1">
              {effectiveTotal.toLocaleString()} total in session
            </span>
          )}
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-primary hover:underline"
            >
              Clear search
            </button>
          )}
        </div>
      </div>
      {pagination && pagination.hasMore && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border/50 bg-background/30 p-2.5 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadOlder}
            disabled={loadingOlder || loadingAll}
            className="flex-1 justify-center border-dashed text-xs"
          >
            {loadingOlder
              ? "Loading..."
              : `Load older (${Math.max(0, effectiveTotal - totalLoadedMessages)} remaining)`}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLoadAll}
            disabled={loadingOlder || loadingAll}
            className="text-xs"
          >
            {loadingAll
              ? `Loading... ${totalLoadedMessages}/${effectiveTotal}`
              : "Load all"}
          </Button>
        </div>
      )}
      {filteredMessages.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-10 rounded-lg border border-dashed border-border/40 bg-background/30">
          {searchQuery
            ? "No messages match the current filter + search."
            : "No messages match this filter."}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMessages.map((msg, i) => (
            <div
              key={msg.uuid || i}
              className="rounded-2xl border border-border/40 bg-card/35 p-3 sm:p-4"
            >
              <MessageBubble msg={msg} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
