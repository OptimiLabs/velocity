import type { JsonlMessage } from "./jsonl";

/**
 * Generates an auto-summary from parsed JSONL messages.
 * Extracts: first prompt topic, key files modified, main actions, errors.
 * Returns a pipe-separated summary string.
 */
export function generateAutoSummary(messages: JsonlMessage[]): string | null {
  const humanMessages: string[] = [];
  const filesModified = new Set<string>();
  const commandsRun: string[] = [];
  let hadErrors = false;

  for (const msg of messages) {
    if (!msg.message) continue;
    const { role, content } = msg.message;

    // Collect human messages for topic extraction
    if (role === "user" && content) {
      const text =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content
                .filter((b) => b.type === "text")
                .map((b) => b.text)
                .join(" ")
            : "";
      if (text.trim()) humanMessages.push(text.slice(0, 200));
    }

    // Extract files and commands from tool calls
    if (role === "assistant" && Array.isArray(content)) {
      for (const block of content) {
        if (block.type !== "tool_use") continue;
        const input = block.input as Record<string, unknown> | undefined;
        if (!input) continue;

        if (
          (block.name === "Write" || block.name === "Edit") &&
          input.file_path
        ) {
          const fp = String(input.file_path);
          const short = fp.split("/").slice(-3).join("/");
          filesModified.add(short);
        }

        if (block.name === "Bash" && input.command) {
          const cmd = String(input.command).split("\n")[0].slice(0, 80);
          if (
            !cmd.startsWith("cat ") &&
            !cmd.startsWith("ls ") &&
            !cmd.startsWith("echo ")
          )
            commandsRun.push(cmd);
        }
      }
    }

    // Detect errors in tool results
    if (role === "user" && Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "tool_result") {
          const text =
            typeof block.content === "string"
              ? block.content
              : typeof block.text === "string"
                ? block.text
                : Array.isArray(block.content)
                  ? block.content
                      .filter(
                        (c: { type: string; text?: string }) =>
                          typeof c.text === "string",
                      )
                      .map((c: { text?: string }) => c.text)
                      .join(" ")
                  : "";
          if (
            text.includes("Error") ||
            text.includes("FAIL") ||
            text.includes("error:")
          )
            hadErrors = true;
        }
      }
    }
  }

  if (humanMessages.length === 0) return null;

  const parts: string[] = [];

  // Topic from first human message
  const firstMsg = humanMessages[0].slice(0, 120).replace(/\n/g, " ").trim();
  parts.push(firstMsg);

  // Files modified
  const filesList = [...filesModified];
  if (filesList.length > 0) {
    const shown = filesList.slice(0, 4);
    const more = filesList.length > 4 ? ` +${filesList.length - 4} more` : "";
    parts.push(`Files: ${shown.join(", ")}${more}`);
  }

  // Notable commands
  if (commandsRun.length > 0) {
    parts.push(`${commandsRun.length} commands run`);
  }

  if (hadErrors) {
    parts.push("(encountered errors)");
  }

  return parts.join(" | ");
}
