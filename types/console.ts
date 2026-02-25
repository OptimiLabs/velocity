export interface ConsoleSession {
  id: string; // consoleSessionId (UUID)
  label: string;
  cwd: string;
  status: "active" | "idle";
  kind?: "claude" | "shell";
  createdAt: number;
  lastActivityAt?: number; // last interaction timestamp
  claudeSessionId?: string; // Claude's session ID for resume
  terminalId?: string; // PTY terminal backing this session
  model?: string; // model ID for this session (e.g. 'claude-opus-4-6')
  effort?: "low" | "medium" | "high"; // thinking effort level
  env?: Record<string, string>; // env overrides passed to Claude process
  manuallyRenamed?: boolean;
  groupId?: string; // session group this session belongs to
  agentName?: string; // agent that launched this session
}

export interface SessionGroup {
  id: string;
  label: string;
  createdAt: number;
  lastActivityAt: number;
}

export interface GroupLayoutState {
  paneTree: PaneNode;
  focusedPaneId: PaneId | null;
  activePaneId: PaneId | null;
  terminals: Record<string, TerminalMeta>;
  tabOrder: string[];
}

export interface SessionMeta {
  label: string;
  cwd: string;
  status: "active" | "idle";
  createdAt: number;
  manuallyRenamed?: boolean;
}

export interface TerminalMeta {
  label?: string;
  cwd: string;
  envOverrides?: Record<string, string>;
  sessionId?: string; // ConsoleSession that spawned this terminal
  isClaudeSession?: boolean; // true if this terminal is running the claude CLI
  claudeSessionId?: string; // Claude's resume session ID
  model?: string; // model for Claude sessions
  effort?: "low" | "medium" | "high"; // effort level for Claude sessions
  command?: string; // custom command to run instead of default shell
  args?: string[]; // arguments for the custom command
  pendingPrompt?: string; // prompt to send after CLI boots (workflow launches)
  hasActivity?: boolean; // true when background terminal has unseen output
  lastOutputAt?: number; // timestamp of last output while in background
  tabColor?: string; // custom tab color (hex)
  terminalState?: "active" | "exited" | "dead"; // explicit lifecycle
  exitCode?: number; // from pty:exit
  exitedAt?: number; // timestamp when process exited
  restartCount?: number; // how many times user restarted this terminal
}

// --- Tiling Window Manager Types ---

export type PaneId = string;

export type PaneContent =
  | { type: "terminal"; terminalId: string }
  | { type: "settings" }
  | { type: "context" }
  | { type: "empty" };

export type PaneNode =
  | { id: PaneId; kind: "leaf"; content: PaneContent }
  | {
      id: PaneId;
      kind: "split";
      orientation: "horizontal" | "vertical";
      children: [PaneNode, PaneNode];
      sizes?: [number, number];
    };

