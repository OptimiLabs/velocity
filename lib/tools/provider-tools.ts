import type { ConfigProvider } from "@/types/provider";

export const CLAUDE_CORE_TOOLS = new Set([
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Bash",
  "NotebookEdit",
  "TodoRead",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
]);

export const CODEX_CORE_TOOLS = new Set([
  "exec_command",
  "shell_command",
  "apply_patch",
  "write_stdin",
  "update_plan",
  "request_user_input",
]);

export const GEMINI_CORE_TOOLS = new Set([
  "shell",
  "read_file",
  "write_file",
  "edit_file",
  "search_files",
  "list_directory",
]);

const PROVIDER_TOOLS: Record<ConfigProvider, Set<string>> = {
  claude: CLAUDE_CORE_TOOLS,
  codex: CODEX_CORE_TOOLS,
  gemini: GEMINI_CORE_TOOLS,
};

export function isCoreToolForProvider(
  name: string,
  provider: ConfigProvider,
): boolean {
  return (PROVIDER_TOOLS[provider] ?? CLAUDE_CORE_TOOLS).has(name);
}
