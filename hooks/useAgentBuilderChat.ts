import { useState, useCallback, useRef } from "react";
import type { Agent } from "@/types/agent";
import {
  extractConfigFromText,
  normalizeGeneratedAgentConfig,
  type AgentConfigStatus,
} from "@/lib/agents/config-normalizer";

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

      try {
        const res = await fetch("/api/agents/build-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            messages: newMessages,
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
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `_Failed to get response: ${(err as Error).message}_`,
          },
        ]);
      } finally {
        setIsStreaming(false);
        setStreamingText("");
        abortRef.current = null;
      }
    },
    [messages, isStreaming, existingAgents, applyExtractedConfig],
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
    abortRef.current?.abort();
  }, []);

  const repairConfig = useCallback(() => {
    const text = latestAccumulatedRef.current;
    if (!text.trim()) return false;
    return applyExtractedConfig(text);
  }, [applyExtractedConfig]);

  const reset = useCallback(() => {
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
