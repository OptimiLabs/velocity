"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/sessions/MarkdownContent";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import {
  Send,
  Loader2,
  AlertCircle,
  RotateCcw,
  DollarSign,
  Bug,
  GitCompare,
  CheckCircle2,
  Sparkles,
  FileText,
  Bot,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComparisonMessage } from "@/types/session";

const PRESETS = [
  {
    key: "efficiency",
    label: "Efficiency Analysis",
    description: "Cost, tools, cache, models",
    icon: DollarSign,
    prompt:
      "Compare these sessions on cost-effectiveness, tool usage patterns, cache efficiency, and model usage. Give one actionable insight to improve efficiency.",
  },
  {
    key: "debugging",
    label: "What went wrong?",
    description: "Errors, anomalies, root causes",
    icon: Bug,
    prompt:
      "Analyze these sessions for problems and inefficiencies. Look for error indicators, cost anomalies, inefficient patterns, and recommend fixes.",
  },
  {
    key: "strategy",
    label: "Best approach?",
    description: "Compare approaches, rank effectiveness",
    icon: GitCompare,
    prompt:
      "Compare the approaches taken across these sessions. Summarize each approach, analyze tool strategy and model choices, then rank by effectiveness.",
  },
  {
    key: "accomplishments",
    label: "Accomplishments",
    description: "Recaps, files, timeline",
    icon: CheckCircle2,
    prompt:
      "Summarize what was accomplished across these sessions. Include per-session recaps, files touched, aggregate stats, and a timeline.",
  },
];

interface AnalysisChatProps {
  messages: ComparisonMessage[];
  onSend: (message: string) => void;
  isPending: boolean;
  error: Error | null;
  onRetry: () => void;
  onCreateSkill?: (content: string) => void;
  onAddToClaudeMd?: (content: string) => void;
}

export function AnalysisChat({
  messages,
  onSend,
  isPending,
  error,
  onRetry,
  onCreateSkill,
  onAddToClaudeMd,
}: AnalysisChatProps) {
  const [input, setInput] = useState("");
  const [isMac, setIsMac] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setIsMac(navigator.platform?.includes("Mac") ?? false);
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isPending]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isPending) return;
    onSend(trimmed);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {isEmpty && !isPending && (
          <div className="flex flex-col items-center justify-center h-full space-y-6">
            <div className="text-center space-y-1">
              <div className="text-sm font-medium text-foreground">
                Start an analysis
              </div>
              <div className="text-xs text-muted-foreground">
                Choose a preset or ask your own question
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 max-w-md w-full">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => onSend(p.prompt)}
                  className="flex items-start gap-2.5 p-3 rounded-lg border border-border/50 hover:bg-muted/40 hover:border-border transition-colors text-left"
                >
                  <p.icon size={14} className="text-primary shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-medium">{p.label}</div>
                    <div className="text-micro text-muted-foreground">
                      {p.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {msg.role === "user" ? (
              <div className="flex items-start gap-2 max-w-[80%]">
                <div className="space-y-1">
                  <div className="text-micro text-muted-foreground/60 text-right px-1">You</div>
                  <div className="rounded-xl bg-primary/10 border border-primary/20 px-3.5 py-2.5 text-sm">
                    {msg.content}
                  </div>
                </div>
                <div className="shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center mt-5">
                  <User size={10} className="text-primary" />
                </div>
              </div>
            ) : (
              <div className="flex gap-2 w-full">
                <div className="shrink-0 w-5 h-5 rounded-full bg-chart-4/10 flex items-center justify-center mt-5">
                  <Bot size={10} className="text-chart-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="text-micro text-muted-foreground/60 px-1">Analysis</div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3 prose-sm">
                    <MarkdownContent content={msg.content} />
                  </div>
                  <div className="flex items-center gap-2 px-1">
                    {msg.tokensUsed != null && msg.tokensUsed > 0 && (
                      <Badge variant="outline" className="text-meta py-0 px-1.5">
                        {formatTokens(msg.tokensUsed)} tokens
                      </Badge>
                    )}
                    {msg.cost != null && msg.cost > 0 && (
                      <Badge
                        variant="outline"
                        className="text-meta py-0 px-1.5 text-chart-1"
                      >
                        {formatCost(msg.cost)}
                      </Badge>
                    )}
                    {onCreateSkill && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCreateSkill(msg.content)}
                        className="gap-1 text-micro h-5 px-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <Sparkles size={10} />
                        Create Skill
                      </Button>
                    )}
                    {onAddToClaudeMd && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAddToClaudeMd(msg.content)}
                        className="gap-1 text-micro h-5 px-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <FileText size={10} />
                        Add to CLAUDE.md
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {isPending && (
          <div className="flex gap-2">
            <div className="shrink-0 w-5 h-5 rounded-full bg-chart-4/10 flex items-center justify-center mt-5">
              <Bot size={10} className="text-chart-4" />
            </div>
            <div className="space-y-1.5">
              <div className="text-micro text-muted-foreground/60 px-1">Analysis</div>
              <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                Analyzing...
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-destructive">
              <AlertCircle size={12} />
              {error.message}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="gap-1 text-xs h-7"
            >
              <RotateCcw size={10} />
              Retry
            </Button>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-border/50 px-4 py-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask a follow-up question..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border/50 bg-muted/20 px-3 py-1.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30"
            disabled={isPending}
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!input.trim() || isPending}
            className="shrink-0 h-8 px-3"
          >
            <Send size={14} />
          </Button>
        </div>
        <div className="text-meta text-muted-foreground/40 mt-0.5 px-1">
          {isMac ? "\u2318" : "Ctrl"}+Enter to send
        </div>
      </div>
    </div>
  );
}
