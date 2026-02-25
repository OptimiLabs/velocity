"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  useCompareChat,
  useComparePreview,
  useSessionsByIds,
} from "@/hooks/useSessions";
import { useDebounce } from "@/hooks/useDebounce";
import {
  useAnalysisConversation,
  useSaveAnalysisConversation,
  useUpdateAnalysisConversation,
} from "@/hooks/useAnalysisConversations";
import { useSettings } from "@/hooks/useSettings";
import { resolveSettingsModel } from "@/lib/compare/models";
import { ScopeSelector } from "./ScopeSelector";
import { AnalysisChat } from "./AnalysisChat";
import { AddToClaudeMdDialog } from "./AddToClaudeMdDialog";
import { SkillEditor } from "@/components/library/SkillEditor";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import { Check, Square, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScopeOptions, ComparisonMessage, Session } from "@/types/session";

const DEFAULT_SCOPE: ScopeOptions = {
  metrics: true,
  summaries: true,
  userPrompts: false,
  assistantResponses: false,
  toolDetails: false,
};

function parseScopeFromParams(param: string | null): ScopeOptions {
  if (!param) return DEFAULT_SCOPE;
  const parts = param.split(",").map((s) => s.trim());
  return {
    metrics: parts.includes("metrics"),
    summaries: parts.includes("summaries"),
    userPrompts: parts.includes("userPrompts"),
    assistantResponses: parts.includes("assistantResponses"),
    toolDetails: parts.includes("toolDetails"),
  };
}

const BOOLEAN_SCOPE_KEYS = [
  "metrics",
  "summaries",
  "userPrompts",
  "assistantResponses",
  "toolDetails",
] as const;

function scopeToParam(scope: ScopeOptions): string {
  return BOOLEAN_SCOPE_KEYS.filter((k) => scope[k]).join(",");
}

function SessionMiniCard({
  session,
  enabled,
  onToggle,
  canDisable,
}: {
  session: Session;
  enabled: boolean;
  onToggle: () => void;
  canDisable: boolean;
}) {
  const models = useMemo(() => {
    try {
      return Object.keys(JSON.parse(session.model_usage)).map((m) =>
        m.replace(/^claude-/, "").replace(/-\d{8}$/, ""),
      );
    } catch {
      return [];
    }
  }, [session.model_usage]);

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onToggle}
            disabled={enabled && !canDisable}
            className={cn(
              "w-[200px] rounded-lg border p-3 text-xs space-y-1.5 text-left transition-all",
              enabled
                ? "border-border bg-muted/40 hover:bg-muted/60"
                : "border-border/30 bg-muted/5 opacity-40 hover:opacity-60",
            )}
          >
            {/* Row 1: Checkbox + title */}
            <div className="flex items-center gap-1.5">
              {enabled ? (
                <Check size={12} className="text-primary shrink-0" />
              ) : (
                <Square size={12} className="text-muted-foreground shrink-0" />
              )}
              <span className="font-mono font-semibold text-foreground truncate">
                {session.slug || session.id.slice(0, 12)}
              </span>
            </div>
            {/* Row 2: Summary */}
            <div className="text-muted-foreground/80 truncate text-xs leading-relaxed">
              {session.summary || session.first_prompt || "\u2014"}
            </div>
            {/* Row 3: Messages + tokens */}
            <div className="flex gap-x-3 text-muted-foreground text-xs">
              <span>{session.message_count} msgs</span>
              <span>
                {formatTokens(
                  session.input_tokens +
                    session.output_tokens +
                    session.cache_read_tokens +
                    session.cache_write_tokens,
                )}{" "}
                tok
              </span>
            </div>
            {/* Row 4: Model badges */}
            {models.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {models.map((m) => (
                  <span
                    key={m}
                    className="px-1.5 py-px rounded-sm bg-muted text-muted-foreground text-micro font-mono leading-tight"
                  >
                    {m}
                  </span>
                ))}
              </div>
            )}
          </button>
        </TooltipTrigger>
        {enabled && !canDisable && (
          <TooltipContent side="bottom">
            At least 1 session required
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

interface CompareWorkspaceProps {
  sessionIds: string[];
  conversationId?: string | null;
  basePath?: string;
}

export function CompareWorkspace({
  sessionIds: initialSessionIds,
  conversationId: initialConversationId,
  basePath = "/analyze",
}: CompareWorkspaceProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Scope + model from URL
  const [scope, setScope] = useState<ScopeOptions>(
    parseScopeFromParams(searchParams.get("scope")),
  );
  const { data: settings } = useSettings();
  const model = searchParams.get("model") || resolveSettingsModel(settings?.model);

  // Chat state
  const [messages, setMessages] = useState<ComparisonMessage[]>([]);

  // Session toggle state
  const [enabledSessionIds, setEnabledSessionIds] = useState<Set<string>>(
    new Set(initialSessionIds),
  );

  // DB persistence state
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId || null,
  );
  const hasCreatedRef = useRef(false);

  // Action dialogs
  const [skillEditorOpen, setSkillEditorOpen] = useState(false);
  const [skillContent, setSkillContent] = useState("");
  const [claudeMdOpen, setClaudeMdOpen] = useState(false);
  const [claudeMdAnalysis, setClaudeMdAnalysis] = useState("");
  const [claudeMdSlug, setClaudeMdSlug] = useState<string | undefined>();

  // Missing sessions warning
  const [missingSessionIds, setMissingSessionIds] = useState<string[]>([]);

  // DB hooks
  const saveConversation = useSaveAnalysisConversation();
  const updateConversation = useUpdateAnalysisConversation();
  const { data: savedConversation } = useAnalysisConversation(
    initialConversationId || null,
  );

  // Restore saved conversation on mount
  useEffect(() => {
    if (!savedConversation) return;
    setMessages(savedConversation.messages);
    setScope(savedConversation.scope);
    setEnabledSessionIds(new Set(savedConversation.enabledSessionIds));
    setConversationId(savedConversation.id);
    hasCreatedRef.current = true;
  }, [savedConversation]);

  // Determine which session IDs to use (from saved conversation or from URL)
  const sessionIds = useMemo(() => {
    if (savedConversation) return savedConversation.sessionIds;
    return initialSessionIds;
  }, [savedConversation, initialSessionIds]);

  // Keep enabled set in sync when the URL-provided IDs change (session-first flow).
  useEffect(() => {
    if (savedConversation) return;
    setEnabledSessionIds((prev) => {
      const next = new Set<string>();
      for (const id of initialSessionIds) {
        if (prev.has(id)) next.add(id);
      }
      for (const id of initialSessionIds) {
        if (!next.has(id)) next.add(id);
      }
      return next;
    });
  }, [initialSessionIds, savedConversation]);

  // Fetch the specific sessions by ID
  const { data: resolvedSessions = [], isLoading: sessionsLoading } =
    useSessionsByIds(sessionIds);

  // Check for deleted source sessions
  useEffect(() => {
    if (sessionsLoading || resolvedSessions.length === 0) return;
    const resolvedIds = new Set(resolvedSessions.map((s) => s.id));
    const missing = sessionIds.filter((id) => !resolvedIds.has(id));
    setMissingSessionIds(missing);
    if (missing.length > 0) {
      // Auto-filter enabled sessions to only those that exist
      setEnabledSessionIds((prev) => {
        const next = new Set([...prev].filter((id) => resolvedIds.has(id)));
        // Ensure at least one is enabled
        if (next.size === 0 && resolvedSessions.length > 0) {
          next.add(resolvedSessions[0].id);
        }
        return next;
      });
    }
  }, [resolvedSessions, sessionIds, sessionsLoading]);

  // Debounced scope for preview calls
  const debouncedScope = useDebounce(scope, 300);
  const debouncedModel = useDebounce(model, 300);

  // Preview hook
  const previewMutation = useComparePreview();

  // Re-fetch preview on scope/model change
  useEffect(() => {
    const enabledIds = Array.from(enabledSessionIds);
    if (enabledIds.length === 0) return;
    const hasAnyScope = BOOLEAN_SCOPE_KEYS.some((k) => debouncedScope[k]);
    if (!hasAnyScope) return;
    previewMutation.mutate({
      sessionIds: enabledIds,
      scope: debouncedScope,
      model: debouncedModel,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedScope, debouncedModel, enabledSessionIds]);

  // Chat hook
  const chatMutation = useCompareChat();

  // Cumulative cost
  const cumulativeCost = useMemo(
    () => messages.reduce((sum, m) => sum + (m.cost || 0), 0),
    [messages],
  );

  // Aggregate stats across enabled sessions
  const sessionAggregates = useMemo(() => {
    const enabled = resolvedSessions.filter((s) => enabledSessionIds.has(s.id));
    if (enabled.length === 0) return null;
    return {
      totalCost: enabled.reduce((sum, s) => sum + s.total_cost, 0),
      totalTokens: enabled.reduce(
        (sum, s) =>
          sum +
          s.input_tokens +
          s.output_tokens +
          s.cache_read_tokens +
          s.cache_write_tokens,
        0,
      ),
      totalMessages: enabled.reduce((sum, s) => sum + s.message_count, 0),
      totalToolCalls: enabled.reduce((sum, s) => sum + s.tool_call_count, 0),
    };
  }, [resolvedSessions, enabledSessionIds]);

  // Update URL when scope/model changes — guard to prevent Suspense re-mount loop
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("scope", scopeToParam(scope));
    params.set("model", model);
    params.delete("provider");
    params.delete("mode");
    if (conversationId) {
      params.set("conversationId", conversationId);
    } else {
      params.delete("conversationId");
    }
    const newSearch = params.toString();
    if (newSearch === searchParams.toString()) return;
    router.replace(`${basePath}?${newSearch}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, model, conversationId, basePath]);

  // Auto-save: create conversation after first AI response
  const autoSaveCreate = useCallback(
    (allMessages: ComparisonMessage[]) => {
      if (hasCreatedRef.current || conversationId) return;
      hasCreatedRef.current = true;

      const firstUserMsg = allMessages.find((m) => m.role === "user");
      const title = firstUserMsg
        ? firstUserMsg.content.slice(0, 60) +
          (firstUserMsg.content.length > 60 ? "..." : "")
        : "Analysis";

      saveConversation.mutate(
        {
          title,
          sessionIds,
          enabledSessionIds: Array.from(enabledSessionIds),
          scope,
          model,
          messages: allMessages,
        },
        {
          onSuccess: (data) => {
            setConversationId(data.id);
          },
        },
      );
    },
    [
      conversationId,
      sessionIds,
      enabledSessionIds,
      scope,
      model,
      saveConversation,
    ],
  );

  // Auto-save: update after each subsequent response
  const autoSaveUpdate = useCallback(
    (allMessages: ComparisonMessage[]) => {
      if (!conversationId) return;
      updateConversation.mutate({
        id: conversationId,
        messages: allMessages,
        enabledSessionIds: Array.from(enabledSessionIds),
        scope,
        model,
      });
    },
    [conversationId, enabledSessionIds, scope, model, updateConversation],
  );

  const handleScopeChange = useCallback((newScope: ScopeOptions) => {
    setScope(newScope);
  }, []
  );

  const handleSend = useCallback(
    (content: string) => {
      const userMsg: ComparisonMessage = {
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);

      const enabledIds = Array.from(enabledSessionIds);

      chatMutation.mutate(
        {
          sessionIds: enabledIds,
          scope,
          model,
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
        {
          onSuccess: (data) => {
            const assistantMsg: ComparisonMessage = {
              role: "assistant",
              content: data.analysis,
              timestamp: new Date().toISOString(),
              tokensUsed: data.tokensUsed,
              cost: data.cost || data.estimatedCost,
            };
            const allMessages = [...updatedMessages, assistantMsg];
            setMessages(allMessages);

            // Auto-save
            if (!conversationId && !hasCreatedRef.current) {
              autoSaveCreate(allMessages);
            } else {
              autoSaveUpdate(allMessages);
            }
          },
        },
      );
    },
    [
      messages,
      enabledSessionIds,
      scope,
      model,
      chatMutation,
      conversationId,
      autoSaveCreate,
      autoSaveUpdate,
    ],
  );

  const handleRetry = useCallback(() => {
    const lastUserIdx = messages.findLastIndex((m) => m.role === "user");
    if (lastUserIdx === -1) return;
    const lastUserContent = messages[lastUserIdx].content;
    setMessages((prev) => prev.slice(0, lastUserIdx));
    setTimeout(() => handleSend(lastUserContent), 50);
  }, [messages, handleSend]);

  const toggleSession = useCallback((id: string) => {
    setEnabledSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Action handlers
  const handleCreateSkill = useCallback((content: string) => {
    setSkillContent(content);
    setSkillEditorOpen(true);
  }, []);

  const handleAddToClaudeMd = useCallback((content: string) => {
    setClaudeMdAnalysis(content);
    setClaudeMdSlug(undefined);
    setClaudeMdOpen(true);
  }, []);

  return (
    <div className="h-full flex flex-col gap-2 px-4 pt-5 pb-0">
      {/* Missing sessions warning */}
      {missingSessionIds.length > 0 && (
        <div className="shrink-0 pb-3">
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle size={14} className="shrink-0" />
            <span>
              {missingSessionIds.length} source session
              {missingSessionIds.length !== 1 ? "s have" : " has"} been deleted
              and {missingSessionIds.length !== 1 ? "are" : "is"} no longer
              available.
            </span>
          </div>
        </div>
      )}

      {/* Session cards with toggles */}
      <div className="shrink-0 pb-2">
        {sessionsLoading ? (
          <div className="flex flex-wrap gap-3">
            {sessionIds.map((id) => (
              <Skeleton key={id} className="h-[120px] w-[200px]" />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 max-h-[240px] overflow-y-auto pr-1">
            {resolvedSessions.map((s) => (
              <SessionMiniCard
                key={s.id}
                session={s}
                enabled={enabledSessionIds.has(s.id)}
                onToggle={() => toggleSession(s.id)}
                canDisable={enabledSessionIds.size > 1}
              />
            ))}
          </div>
        )}
        {!sessionsLoading &&
          sessionAggregates &&
          resolvedSessions.length > 1 && (
            <div className="flex items-center gap-4 mt-2 px-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {enabledSessionIds.size < resolvedSessions.length
                  ? `${enabledSessionIds.size} of ${resolvedSessions.length} sessions enabled`
                  : "Session totals"}
                :
              </span>
              <span>
                <span className="text-foreground font-medium">
                  {formatCost(sessionAggregates.totalCost)}
                </span>{" "}
                spent
              </span>
              <span>{sessionAggregates.totalMessages} msgs</span>
              <span>
                {formatTokens(sessionAggregates.totalTokens)} tokens used
              </span>
              <span>{sessionAggregates.totalToolCalls} tool calls</span>
            </div>
          )}
      </div>

      {/* Main area: sidebar + content */}
      <div className="flex-1 flex gap-4 min-h-0 pb-4">
        {/* Sidebar */}
        <div className="w-[260px] shrink-0 border border-border/50 rounded-lg p-3 overflow-y-auto">
          <ScopeSelector
            scope={scope}
            onScopeChange={handleScopeChange}
            preview={previewMutation.data ?? null}
            isLoadingPreview={previewMutation.isPending}
            cumulativeCost={cumulativeCost}
          />
        </div>

        {/* Content area — single unified chat */}
        <div className="flex-1 border border-border/50 rounded-lg overflow-hidden">
          <AnalysisChat
            messages={messages}
            onSend={handleSend}
            isPending={chatMutation.isPending}
            error={chatMutation.error}
            onRetry={handleRetry}
            onCreateSkill={handleCreateSkill}
            onAddToClaudeMd={handleAddToClaudeMd}
          />
        </div>
      </div>

      {/* Action dialogs */}
      <SkillEditor
        open={skillEditorOpen}
        onClose={() => setSkillEditorOpen(false)}
        onSuccess={() => setSkillEditorOpen(false)}
        sourceContext={skillContent}
      />

      <AddToClaudeMdDialog
        open={claudeMdOpen}
        onClose={() => setClaudeMdOpen(false)}
        analysis={claudeMdAnalysis}
        sessionSlug={claudeMdSlug}
      />
    </div>
  );
}
