export interface LiveEvent {
  type: "session:updated" | "session:created" | "session:deleted";
  sessionId: string;
  filePath: string;
  timestamp: number;
  slug?: string;
  model?: string;
  lastMessagePreview?: string;
}

export interface LiveSession {
  id: string;
  filePath: string;
  lastUpdate: number;
  slug?: string;
  model?: string;
  lastMessagePreview?: string;
}
