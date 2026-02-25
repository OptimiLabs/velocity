/**
 * Lightweight "leader election" using BroadcastChannel.
 *
 * Only ONE tab becomes the leader. The leader runs expensive
 * background work (auto-indexing, etc.) so duplicate tabs don't
 * hammer the server.
 *
 * Algorithm:
 * 1. On init, each tab posts a "claim" with a random id.
 * 2. If no "leader" message arrives within a short window, this tab
 *    assumes leadership and broadcasts "leader".
 * 3. Leaders send periodic heartbeats. If a heartbeat is missed,
 *    remaining tabs race to claim leadership.
 */

type Listener = (isLeader: boolean) => void;

let channel: BroadcastChannel | null = null;
let isLeader = false;
let tabId = "";
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let electionTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

const HEARTBEAT_MS = 2000;
const ELECTION_TIMEOUT_MS = 500 + Math.random() * 500;

function notify() {
  for (const fn of listeners) fn(isLeader);
}

function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    channel?.postMessage({ type: "heartbeat", id: tabId });
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startElection() {
  if (electionTimer) clearTimeout(electionTimer);
  electionTimer = setTimeout(() => {
    isLeader = true;
    channel?.postMessage({ type: "leader", id: tabId });
    startHeartbeat();
    notify();
  }, ELECTION_TIMEOUT_MS);
}

function handleMessage(e: MessageEvent) {
  const { type, id } = e.data || {};
  if (id === tabId) return;

  if (type === "leader" || type === "heartbeat") {
    // Someone else is leader — cancel our election
    if (electionTimer) {
      clearTimeout(electionTimer);
      electionTimer = null;
    }
    if (isLeader) {
      isLeader = false;
      stopHeartbeat();
      notify();
    }
  }

  if (type === "claim" && isLeader) {
    // Reassert leadership
    channel?.postMessage({ type: "leader", id: tabId });
  }

  if (type === "released" && !isLeader) {
    // Previous leader left — start election
    startElection();
  }
}

function init() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined")
    return;
  if (channel) return;

  tabId = Math.random().toString(36).slice(2);
  channel = new BroadcastChannel("tab-leader");
  channel.addEventListener("message", handleMessage);

  // Announce and start election
  channel.postMessage({ type: "claim", id: tabId });
  startElection();

  window.addEventListener("beforeunload", () => {
    if (isLeader) {
      channel?.postMessage({ type: "released", id: tabId });
    }
    stopHeartbeat();
    channel?.close();
  });
}

export function onLeaderChange(fn: Listener): () => void {
  init();
  listeners.add(fn);
  fn(isLeader);
  return () => listeners.delete(fn);
}
