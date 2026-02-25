import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { aiGenerate } from "@/lib/ai/generate";

const SYSTEM_PROMPT = `You are an agent builder assistant. Help the user create a Claude Code agent by understanding their requirements and generating a configuration.

Always include the current complete agent configuration as a fenced code block with the language tag "agent-config":

\`\`\`agent-config
{
  "name": "agent-name",
  "description": "Brief description",
  "model": "sonnet",
  "effort": "high",
  "tools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
  "color": "#3b82f6",
  "prompt": "You are a specialized agent that..."
}
\`\`\`

Rules:
- The "name" should be kebab-case, concise (max 30 chars)
- The "model" must be one of: "opus", "sonnet", "haiku"
- The "effort" must be one of: "low", "medium", "high"
- Available tools include: Read, Write, Edit, Bash, Glob, Grep, Task, WebFetch, WebSearch, NotebookEdit
- The "prompt" should be a detailed system prompt for the agent, covering its purpose, guidelines, and workflow
- The "color" should be one of these hex values: #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #7c3aed, #ec4899, #06b6d4
- The "description" should be a single sentence summarizing the agent's purpose

When the user describes changes, update the config block and explain what you changed.
Keep your conversational responses concise — focus on explaining key design decisions.`;

export async function POST(request: Request) {
  try {
    const { messages, existingAgents, provider } = (await request.json()) as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      existingAgents?: { name: string; description: string }[];
      provider?:
        | "anthropic"
        | "openai"
        | "google"
        | "openrouter"
        | "local"
        | "custom"
        | "claude-cli";
    };

    const validMessages = Array.isArray(messages)
      ? messages.filter(
          (m): m is { role: "user" | "assistant"; content: string } =>
            !!m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string",
        )
      : [];

    if (!validMessages.length) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const allowedProviders = new Set([
      "anthropic",
      "openai",
      "google",
      "openrouter",
      "local",
      "custom",
      "claude-cli",
    ]);
    if (provider && !allowedProviders.has(provider)) {
      return new Response(JSON.stringify({ error: "invalid provider" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build the prompt: system + conversation history as a single prompt string
    const conversationText = validMessages
      .map((m) => `${m.role === "user" ? "Human" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    const existingBlock =
      existingAgents?.length
        ? `\n\nExisting agents (avoid duplicating these):\n${existingAgents.map((a) => `- "${a.name}": ${a.description}`).join("\n")}\nCreate something distinct and complementary.`
        : "";

    const systemPromptWithContext = SYSTEM_PROMPT + existingBlock;

    const fullPrompt = `${conversationText}\n\nAssistant:`;

    if (provider && provider !== "claude-cli") {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (payload: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          };
          try {
            const text = await aiGenerate(fullPrompt, {
              system: systemPromptWithContext,
              provider,
              timeoutMs: 180_000,
            });
            if (text) send({ type: "text", data: text });
            send({ type: "done" });
          } catch (error) {
            send({
              type: "error",
              data: error instanceof Error ? error.message : "Failed to generate response",
            });
            send({ type: "done" });
          } finally {
            try {
              controller.close();
            } catch {
              // ignore close race
            }
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const encoder = new TextEncoder();
    let activeProc: ChildProcessWithoutNullStreams | null = null;
    const streamState = { aborted: false };
    const stream = new ReadableStream({
      start(controller) {
        let proc: ChildProcessWithoutNullStreams | null = null;
        let sawDeltaText = false;
        let finalized = false;

        const sendEvent = (payload: Record<string, unknown>) => {
          if (finalized) return;
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
            );
          } catch {
            // Stream was canceled/closed by the client
          }
        };

        const finish = (emitDone = true) => {
          if (finalized) return;
          if (emitDone && !streamState.aborted) {
            sendEvent({ type: "done" });
          }
          finalized = true;
          activeProc = null;
          request.signal.removeEventListener("abort", onAbort);
          try {
            controller.close();
          } catch {
            // stream may already be closed
          }
        };

        const handleParsed = (parsed: unknown) => {
          if (!parsed || typeof parsed !== "object") return;
          const event = parsed as {
            type?: string;
            delta?: { text?: unknown };
            result?: unknown;
          };

          if (
            event.type === "content_block_delta" &&
            typeof event.delta?.text === "string"
          ) {
            sawDeltaText = true;
            sendEvent({ type: "text", data: event.delta.text });
            return;
          }

          // Some CLI versions emit the full message only at the end.
          // Avoid duplicating text when delta events were already streamed.
          if (
            event.type === "result" &&
            typeof event.result === "string" &&
            !sawDeltaText
          ) {
            sendEvent({ type: "text", data: event.result });
          }
        };

        const flushLines = (bufferRef: { current: string }, flushPartial = false) => {
          const lines = bufferRef.current.split("\n");
          bufferRef.current = flushPartial ? "" : (lines.pop() || "");

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              handleParsed(JSON.parse(line));
            } catch {
              // Ignore non-JSON progress lines
            }
          }
        };

        const killProc = () => {
          if (!proc || proc.killed) return;
          try {
            proc.kill("SIGTERM");
          } catch {
            // ignore
          }
        };

        const onAbort = () => {
          streamState.aborted = true;
          killProc();
        };

        request.signal.addEventListener("abort", onAbort, { once: true });

        proc = spawn(
          "claude",
          [
            "--print",
            "--output-format",
            "stream-json",
            "-p",
            fullPrompt,
            "--system-prompt",
            systemPromptWithContext,
          ],
          {
            env: { ...process.env, LANG: "en_US.UTF-8" },
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
        activeProc = proc;

        const bufferRef = { current: "" };

        proc.stdout.on("data", (chunk: Buffer) => {
          bufferRef.current += chunk.toString();
          flushLines(bufferRef);
        });

        proc.stderr.on("data", (chunk: Buffer) => {
          if (streamState.aborted || finalized) return;
          const text = chunk.toString();
          // Ignore progress/status messages from CLI, only forward real errors
          if (text.includes("Error") || text.includes("error")) {
            sendEvent({ type: "error", data: text.trim() });
          }
        });

        proc.on("close", () => {
          flushLines(bufferRef, true);
          finish(true);
        });

        proc.on("error", (err) => {
          if (!streamState.aborted) {
            sendEvent({ type: "error", data: err.message });
          }
          finish(false);
        });
      },
      cancel() {
        streamState.aborted = true;
        if (!activeProc || activeProc.killed) return;
        try {
          activeProc.kill("SIGTERM");
        } catch {
          // ignore
        } finally {
          activeProc = null;
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to start builder",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
