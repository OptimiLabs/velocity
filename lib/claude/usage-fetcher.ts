import * as pty from "node-pty";
import { killProcess } from "@/lib/platform";

// ── Types ────────────────────────────────────────────────────────

export interface UsageSection {
  label: string; // "Current session" | "Current week (all models)" | ...
  percentUsed: number | null; // 0-100 from "27% used"
  resetsAt: string | null; // ISO timestamp
  timezone: string | null; // "America/Los_Angeles"
}

export interface RealUsageData {
  sections: UsageSection[];
  fetchedAt: string;
  error: string | null;
}

// ── ANSI Strip ───────────────────────────────────────────────────

 
const ANSI_RE =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><~]/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

// ── Parser ───────────────────────────────────────────────────────

// Single-line header: "Current week (all models) · Resets Feb 17 at 12:00 AM (America/Los_Angeles)"
const HEADER_SINGLE_RE = /^(.+?)\s*·\s*Resets\s+(.+?)\s*\(([^)]+)\)/;

// Multi-line "Resets" line: "Resets 7:59pm (America/Los_Angeles)"
const RESETS_RE = /^Resets\s+(.+?)\s*\(([^)]+)\)/;

// Matches: "27% used" or "0% used"
const PERCENT_RE = /(\d+)%\s*used/;

// Known section labels in multi-line format
const SECTION_LABELS = [
  "Current session",
  "Current week (all models)",
  "Current week (Sonnet only)",
  "Extra usage",
];

export function parseUsageOutput(raw: string): UsageSection[] {
  const lines = stripAnsi(raw)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const sections: UsageSection[] = [];
  let current: UsageSection | null = null;

  for (const line of lines) {
    // Try single-line header format first (legacy)
    const headerMatch = line.match(HEADER_SINGLE_RE);
    if (headerMatch) {
      if (current) sections.push(current);
      const resetText = headerMatch[2].trim();
      current = {
        label: headerMatch[1].trim(),
        percentUsed: null,
        resetsAt: parseResetDate(resetText),
        timezone: headerMatch[3].trim(),
      };
      continue;
    }

    // Multi-line format: standalone section label
    if (SECTION_LABELS.includes(line)) {
      if (current) sections.push(current);
      current = {
        label: line,
        percentUsed: null,
        resetsAt: null,
        timezone: null,
      };
      continue;
    }

    // Multi-line format: standalone "Resets ..." line
    const resetsMatch = line.match(RESETS_RE);
    if (resetsMatch && current) {
      current.resetsAt = parseResetDate(resetsMatch[1].trim());
      current.timezone = resetsMatch[2].trim();
      continue;
    }

    const pctMatch = line.match(PERCENT_RE);
    if (pctMatch && current) {
      current.percentUsed = parseInt(pctMatch[1], 10);
    }
  }

  // Push last section
  if (current) sections.push(current);

  return sections;
}

/**
 * Parse "Feb 17 at 12:00 AM" into an ISO date string.
 * Uses current year, adjusting forward if the date appears to be in the past by > 300 days.
 */
function parseResetDate(text: string): string | null {
  try {
    const now = new Date();
    const year = now.getFullYear();
    // Normalize "at" → space, then parse
    const normalized = text.replace(/\s+at\s+/i, " ");
    const attempt = new Date(`${normalized} ${year}`);
    if (isNaN(attempt.getTime())) return null;
    // If date is > 300 days in the past, it's probably next year
    if (now.getTime() - attempt.getTime() > 300 * 86_400_000) {
      attempt.setFullYear(year + 1);
    }
    return attempt.toISOString();
  } catch {
    return null;
  }
}

// ── In-memory cache & dedup ──────────────────────────────────────
// Use globalThis to survive HMR module re-evaluation in dev mode.
// Without this, each HMR reload resets these to null, causing duplicate PTY spawns.

const G = globalThis as Record<string, unknown>;
const CACHE_KEY = "__usage_fetcher_cache";
const INFLIGHT_KEY = "__usage_fetcher_inflight";
const ACTIVE_PTY_KEY = "__usage_fetcher_active_pty";

function getCache(): { data: RealUsageData; at: number } | null {
  return (G[CACHE_KEY] as { data: RealUsageData; at: number } | null) ?? null;
}
function setCache(data: RealUsageData) {
  G[CACHE_KEY] = { data, at: Date.now() };
}
function getInflight(): Promise<RealUsageData> | null {
  return (G[INFLIGHT_KEY] as Promise<RealUsageData> | null) ?? null;
}
function setInflight(p: Promise<RealUsageData> | null) {
  G[INFLIGHT_KEY] = p;
}
function getActivePty(): { pid: number; kill: () => void } | null {
  return (G[ACTIVE_PTY_KEY] as { pid: number; kill: () => void } | null) ?? null;
}
function setActivePty(pty: { pid: number; kill: () => void } | null) {
  G[ACTIVE_PTY_KEY] = pty;
}

const CACHE_TTL_MS = 60_000;

// ── Main fetcher ─────────────────────────────────────────────────

const PTY_TIMEOUT_MS = 8_000;
const SAFETY_KILL_MS = 15_000;

export async function fetchRealUsage(): Promise<RealUsageData> {
  // Return cached if fresh
  const cached = getCache();
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  // Dedup concurrent requests
  const inflight = getInflight();
  if (inflight) return inflight;

  const p = doFetch().finally(() => {
    setInflight(null);
  });
  setInflight(p);
  return p;
}

async function doFetch(): Promise<RealUsageData> {
  const makeError = (error: string): RealUsageData => ({
    sections: [],
    fetchedAt: new Date().toISOString(),
    error,
  });

  // Kill any leftover PTY from a previous fetch (e.g. survived HMR reload)
  const stale = getActivePty();
  if (stale) {
    try { stale.kill(); } catch {}
    try { process.kill(stale.pid, 0); killProcess(stale.pid); } catch {}
    setActivePty(null);
  }

  return new Promise<RealUsageData>((resolve) => {
    let output = "";
    let promptCount = 0;
    let resolved = false;

    const finish = (data: RealUsageData) => {
      if (resolved) return;
      resolved = true;
      setActivePty(null);
      // Cache even errors (prevents hammering on repeated failures)
      setCache(data);
      // Kill PTY — node-pty kill() sends SIGHUP
      const termPid = term?.pid;
      try {
        term.kill();
      } catch {
        // ignore
      }
      // SIGKILL fallback — if SIGHUP is ignored, force kill after 3s
      if (termPid) {
        setTimeout(() => {
          try { process.kill(termPid, 0); killProcess(termPid); } catch {}
        }, 3_000);
      }
      clearTimeout(safetyTimer);
      clearTimeout(timeoutTimer);
      resolve(data);
    };

    // Build env without CLAUDE* vars that trigger nested-session detection
    const cleanEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v === undefined) continue;
      if (k === "CLAUDECODE" || k.startsWith("CLAUDE_")) continue;
      cleanEnv[k] = v;
    }

    let term: pty.IPty;
    try {
      term = pty.spawn("claude", ["--strict-mcp-config", "--mcp-config", "{}"], {
        name: "xterm-256color",
        cols: 120,
        rows: 40,
        env: cleanEnv,
      });
    } catch (err: unknown) {
      // No leak here — `term` was never assigned, so no process to kill
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ENOENT") || msg.includes("not found")) {
        resolve(makeError("claude_not_found"));
      } else {
        resolve(makeError(`spawn_error: ${msg}`));
      }
      return;
    }

    // Track active PTY so it can be killed if a new fetch starts (or HMR reloads)
    setActivePty({ pid: term.pid, kill: () => term.kill() });

    // Safety kill — unconditional, prevents zombie processes
    const safetyTimer = setTimeout(() => {
      finish(makeError("timeout"));
    }, SAFETY_KILL_MS);

    // Timeout for /usage response
    const timeoutTimer = setTimeout(() => {
      finish(makeError("timeout"));
    }, PTY_TIMEOUT_MS);

    term.onData((data: string) => {
      output += data;

      // Check for auth prompts
      const plain = stripAnsi(output);
      if (
        plain.includes("log in") ||
        plain.includes("authenticate") ||
        plain.includes("API key")
      ) {
        finish(makeError("not_authenticated"));
        return;
      }

      // Detect prompt ("> " or "❯ " at end of a line)
      // Count prompts: first = ready, second = /usage complete
      const promptMatches = plain.match(/[>❯]\s*$/gm);
      const newPromptCount = promptMatches?.length ?? 0;

      if (newPromptCount > promptCount) {
        promptCount = newPromptCount;

        if (promptCount === 1) {
          // First prompt — claude is ready, send /usage
          term.write("/usage\r");
        } else if (promptCount >= 2) {
          // Second prompt — /usage output complete
          const sections = parseUsageOutput(output);
          if (sections.length === 0) {
            finish(makeError("no_sections_parsed"));
          } else {
            finish({
              sections,
              fetchedAt: new Date().toISOString(),
              error: null,
            });
          }
        }
      }
    });

    term.onExit(() => {
      if (!resolved) {
        const sections = parseUsageOutput(output);
        if (sections.length > 0) {
          finish({
            sections,
            fetchedAt: new Date().toISOString(),
            error: null,
          });
        } else {
          finish(makeError("process_exited"));
        }
      }
    });
  });
}
