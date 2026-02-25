export interface RoutingGraphNode {
  id: string; // absolute file path
  absolutePath: string;
  label: string; // display name
  nodeType: "claude-md" | "skill" | "agent" | "knowledge" | "folder" | "entrypoint";
  projectRoot: string | null; // which repo this belongs to
  exists: boolean; // file exists on disk?
  position: { x: number; y: number } | null; // saved canvas position
  fileSize: number | null;
  lastModified: string | null;
  childCount?: number; // direct child count (folder-only)
  isCollapsed?: boolean; // collapse state (folder-only)
  provider?: "claude" | "codex" | "gemini"; // which provider this node belongs to
}

export interface RoutingGraphEdge {
  id: string;
  source: string; // absolute path of referencing file
  target: string; // absolute path of referenced file
  context: string; // trigger/description text
  referenceType:
    | "path"
    | "tilde-path"
    | "relative-path"
    | "inline-mention"
    | "table-entry"
    | "structural"
    | "manual";
  isManual: boolean; // user-added vs auto-detected
}

export interface RoutingGraph {
  version: 1;
  lastScannedAt: string;
  scanDurationMs: number;
  totalTokensUsed: number;
  nodes: RoutingGraphNode[];
  edges: RoutingGraphEdge[];
}

export interface RoutingEntrypoint {
  id: string; // absolute path of entrypoint file (CLAUDE.md / AGENTS.md / GEMINI.md)
  label: string; // display filename
  projectRoot: string | null;
  provider: "claude" | "codex" | "gemini";
}

export interface ScanProgressEvent {
  type: "progress" | "file-parsed" | "complete" | "error";
  phase?: "discovering" | "parsing" | "resolving" | "building";
  current?: number;
  total?: number;
  currentFile?: string;
  filePath?: string;
  referencesFound?: number;
  tokensUsed?: number;
  graph?: RoutingGraph;
  error?: string;
}
