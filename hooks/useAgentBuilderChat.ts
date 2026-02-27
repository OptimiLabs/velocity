import { useState, useCallback, useRef } from "react";
import type { Agent } from "@/types/agent";
import {
  extractConfigFromText,
  normalizeGeneratedAgentConfig,
  type AgentConfigStatus,
} from "@/lib/agents/config-normalizer";
import {
  cancelProcessingJob,
  completeProcessingJob,
  failProcessingJob,
  startProcessingJob,
  summarizeForJob,
} from "@/lib/processing/jobs";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type AgentBuilderChatProvider =
  | "claude-cli"
  | "anthropic"
  | "openai"
  | "google"
  | "openrouter"
  | "local"
  | "custom";

/** Strips ```agent-config blocks from text for display */
function stripConfigBlocks(text: string): string {
  return text.replace(/```agent-config\s*\r?\n[\s\S]*?```/gi, "").trim();
}

function serializeCurrentConfig(config: Partial<Agent>): Partial<Agent> | null {
  const next: Partial<Agent> = {};

  if (typeof config.name === "string" && config.name.trim()) {
    next.name = config.name.trim();
  }
  if (typeof config.description === "string" && config.description.trim()) {
    next.description = config.description.trim();
  }
  if (typeof config.model === "string" && config.model.trim()) {
    next.model = config.model.trim();
  }
  if (
    config.effort === "low" ||
    config.effort === "medium" ||
    config.effort === "high"
  ) {
    next.effort = config.effort;
  }
  if (typeof config.prompt === "string" && config.prompt.trim()) {
    next.prompt = config.prompt;
  }
  if (Array.isArray(config.tools)) {
    const tools = config.tools.filter(
      (tool): tool is string => typeof tool === "string" && tool.trim().length > 0,
    );
    if (tools.length > 0) next.tools = tools;
  }
  if (Array.isArray(config.disallowedTools)) {
    const disallowedTools = config.disallowedTools.filter(
      (tool): tool is string => typeof tool === "string" && tool.trim().length > 0,
    );
    if (disallowedTools.length > 0) next.disallowedTools = disallowedTools;
  }
  if (Array.isArray(config.skills)) {
    const skills = config.skills.filter(
      (skill): skill is string => typeof skill === "string" && skill.trim().length > 0,
    );
    if (skills.length > 0) next.skills = skills;
  }

  return Object.keys(next).length > 0 ? next : null;
}

export function useAgentBuilderChat(
  existingAgents?: { name: string; description: string }[],
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentConfig, setCurrentConfig] = useState<Partial<Agent>>({});
  const [configStatus, setConfigStatus] = useState<AgentConfigStatus>("empty");
  const [configWarnings, setConfigWarnings] = useState<string[]>([]);
  const [configErrors, setConfigErrors] = useState<string[]>([]);
  const [repairNotes, setRepairNotes] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const latestAccumulatedRef = useRef("");
  const activeJobIdRef = useRef<string | null>(null);

  const applyExtractedConfig = useCallback(
    (text: string, fallbackDescription = "") => {
      const extracted = extractConfigFromText(text);
      if (!extracted.parsed) {
        if (text.trim().length === 0) {
          setConfigStatus("empty");
          setConfigErrors([]);
          setConfigWarnings([]);
          setRepairNotes([]);
          return false;
        }
        setConfigStatus("invalid");
        setConfigErrors([
          extracted.rawCandidate
            ? "Found a config block, but the JSON was malformed."
            : "No parseable config block found in response.",
        ]);
        setConfigWarnings([]);
        setRepairNotes([]);
        return false;
      }

      const normalized = normalizeGeneratedAgentConfig(extracted.parsed, {
        fallbackDescription,
      });
      setCurrentConfig((prev) => ({ ...prev, ...normalized.config }));
      setConfigStatus(normalized.status);
      setConfigWarnings(normalized.warnings);
      setConfigErrors(normalized.validation.errors);
      setRepairNotes(normalized.repairNotes);
      return normalized.validation.isValid;
    },
    [],
  );

  const sendMessage = useCallback(
    async (text: string, provider: AgentBuilderChatProvider = "claude-cli") => {
      if (!text.trim() || isStreaming) return;

      const userMessage: ChatMessage = { role: "user", content: text };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setIsStreaming(true);
      setStreamingText("");
      setConfigErrors([]);

      abortRef.current = new AbortController();
      const jobId = startProcessingJob({
        title: "Agent chat response",
        subtitle: summarizeForJob(text),
        source: "agents",
      });
      activeJobIdRef.current = jobId;

      try {
        const serializedCurrentConfig = serializeCurrentConfig(currentConfig);
        const res = await fetch("/api/agents/build-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            messages: newMessages,
            ...(serializedCurrentConfig
              ? { currentConfig: serializedCurrentConfig }
              : {}),
            ...(existingAgents?.length && { existingAgents }),
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const errorBody = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(errorBody.error || `API error: ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let accumulated = "";
        let sseBuffer = "";
        latestAccumulatedRef.current = "";
        const handleEvent = (event: string) => {
          const dataLine = event
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) return;

          try {
            const parsed = JSON.parse(dataLine.slice(6));
            if (parsed.type === "text" && typeof parsed.data === "string") {
              accumulated += parsed.data;
              latestAccumulatedRef.current = accumulated;
              setStreamingText(accumulated);

              // Best-effort extraction while streaming.
              applyExtractedConfig(accumulated, text);
            } else if (parsed.type === "error") {
              const msg =
                typeof parsed.data === "string"
                  ? parsed.data
                  : "Unknown streaming error";
              accumulated += `\n\n_Error: ${msg}_`;
              latestAccumulatedRef.current = accumulated;
              setStreamingText(accumulated);
            }
          } catch {
            // Invalid JSON in SSE — skip
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const events = sseBuffer.split("\n\n");
          sseBuffer = events.pop() || "";

          for (const event of events) {
            handleEvent(event);
          }
        }

        if (sseBuffer.trim()) {
          handleEvent(sseBuffer);
        }

        // Finalize: add assistant message with config blocks stripped for display
        applyExtractedConfig(accumulated, text);
        const displayText = stripConfigBlocks(accumulated);
        if (displayText) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: displayText },
          ]);
        }
        completeProcessingJob(jobId, {
          subtitle: summarizeForJob("Response ready"),
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          if (activeJobIdRef.current === jobId) {
            cancelProcessingJob(jobId, "Stopped by user");
          }
          return;
        }
        if (activeJobIdRef.current === jobId) {
          failProcessingJob(jobId, err, {
            subtitle: summarizeForJob(text),
          });
        }
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `_Failed to get response: ${(err as Error).message}_`,
          },
        ]);
      } finally {
        if (activeJobIdRef.current === jobId) {
          activeJobIdRef.current = null;
        }
        setIsStreaming(false);
        setStreamingText("");
        abortRef.current = null;
      }
    },
    [messages, isStreaming, existingAgents, currentConfig, applyExtractedConfig],
  );

  const updateConfig = useCallback((updates: Partial<Agent>) => {
    setCurrentConfig((prev) => {
      const next = { ...prev, ...updates };
      const hasName = typeof next.name === "string" && next.name.trim().length > 0;
      const hasPrompt = typeof next.prompt === "string" && next.prompt.trim().length > 0;
      if (hasName && hasPrompt) {
        setConfigErrors([]);
        setConfigStatus("valid");
      }
      return next;
    });
  }, []);

  const stopStreaming = useCallback(() => {
    const activeJobId = activeJobIdRef.current;
    if (activeJobId) {
      cancelProcessingJob(activeJobId, "Stopped by user");
      activeJobIdRef.current = null;
    }
    abortRef.current?.abort();
  }, []);

  const repairConfig = useCallback(() => {
    const text = latestAccumulatedRef.current;
    if (!text.trim()) return false;
    return applyExtractedConfig(text);
  }, [applyExtractedConfig]);

  const reset = useCallback(() => {
    const activeJobId = activeJobIdRef.current;
    if (activeJobId) {
      cancelProcessingJob(activeJobId, "Canceled");
      activeJobIdRef.current = null;
    }
    abortRef.current?.abort();
    setMessages([]);
    setCurrentConfig({});
    setConfigStatus("empty");
    setConfigWarnings([]);
    setConfigErrors([]);
    setRepairNotes([]);
    setIsStreaming(false);
    setStreamingText("");
    latestAccumulatedRef.current = "";
  }, []);

  return {
    messages,
    currentConfig,
    isStreaming,
    streamingText,
    configStatus,
    configWarnings,
    configErrors,
    repairNotes,
    sendMessage,
    updateConfig,
    stopStreaming,
    repairConfig,
    reset,
  };
}
