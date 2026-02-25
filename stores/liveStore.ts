import { create } from "zustand";
import type { LiveEvent, LiveSession } from "@/lib/watcher/types";

interface LiveStore {
  sessions: Map<string, LiveSession>;
  events: LiveEvent[];
  connected: boolean;
  reconnectAttempts: number;
  setConnected: (connected: boolean) => void;
  setReconnectAttempts: (count: number) => void;
  addEvent: (event: LiveEvent) => void;
  updateSession: (session: LiveSession) => void;
  removeSession: (id: string) => void;
}

export const useLiveStore = create<LiveStore>((set) => ({
  sessions: new Map(),
  events: [],
  connected: false,
  reconnectAttempts: 0,
  setConnected: (connected) =>
    set({
      connected,
      reconnectAttempts: connected ? 0 : (undefined as unknown as number),
    }),
  setReconnectAttempts: (reconnectAttempts) => set({ reconnectAttempts }),
  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 200),
    })),
  updateSession: (session) =>
    set((state) => {
      const next = new Map(state.sessions);
      next.set(session.id, session);
      return { sessions: next };
    }),
  removeSession: (id) =>
    set((state) => {
      const next = new Map(state.sessions);
      next.delete(id);
      return { sessions: next };
    }),
}));
