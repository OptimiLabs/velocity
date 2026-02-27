"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { ImageAddon } from "@xterm/addon-image";
import { SerializeAddon } from "@xterm/addon-serialize";
import {
  registerTerminalHandler,
  unregisterTerminalHandler,
} from "@/lib/console/terminal-registry";
import { parseOsc133 } from "@/lib/console/prompt-marks";
import {
  promptTrackers,
  MAX_SERIALIZE_BYTES,
  cacheTerminalDom,
  disposeTerminalDomCache,
  setSerializedBuffer,
  takeCachedTerminal,
  takeSerializedBuffer,
} from "@/lib/console/terminal-cache";
import { PromptMarkTracker } from "@/lib/console/prompt-marks";
import { useSettings } from "@/hooks/useSettings";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { DEFAULT_APPEARANCE, TERMINAL_THEMES } from "@/lib/console/terminal-settings";
import { TerminalSearch } from "./TerminalSearch";
import { PasteHistoryPanel, recordPaste } from "./PasteHistoryPanel";
import { CopyModeOverlay } from "./CopyModeOverlay";
import { saveScrollback, loadScrollback } from "@/lib/console/terminal-db";
import "@xterm/xterm/css/xterm.css";

interface TerminalPanelProps {
  terminalId: string;
  cwd: string;
  wsRef: React.RefObject<WebSocket | null>;
  envOverrides?: Record<string, string>;
  wsVersion?: number;
  command?: string; // Custom command to run instead of default shell
  args?: string[]; // Arguments for the custom command
  pendingPrompt?: string; // Prompt to send after CLI output settles
  onPromptConsumed?: () => void; // Called after pendingPrompt is sent
  isActive?: boolean; // Whether this terminal's pane is the active/focused one
}

/** Check if element has been laid out with meaningful dimensions.
 * A terminal needs at least ~50px in each dimension to render even a minimal
 * grid. Panels mid-collapse (e.g. 11px) must be rejected — fitting to them
 * produces 2-column terminals that persist after the panel re-expands. */
const MIN_TERMINAL_PX = 50;
function hasSize(el: HTMLElement | null): boolean {
  return !!el && el.offsetWidth >= MIN_TERMINAL_PX && el.offsetHeight >= MIN_TERMINAL_PX;
}

const FALLBACK_TERMINAL_THEME_KEY = "one-dark";

function resolveTerminalThemeKey(themeKey?: string): string {
  if (themeKey && TERMINAL_THEMES[themeKey]) return themeKey;
  if (DEFAULT_APPEARANCE.theme && TERMINAL_THEMES[DEFAULT_APPEARANCE.theme]) {
    return DEFAULT_APPEARANCE.theme;
  }
  return FALLBACK_TERMINAL_THEME_KEY;
}

function resolveTerminalTheme(themeKey?: string) {
  const key = resolveTerminalThemeKey(themeKey);
  return {
    key,
    theme:
      TERMINAL_THEMES[key]?.theme ??
      TERMINAL_THEMES[FALLBACK_TERMINAL_THEME_KEY].theme,
  };
}

function applyTerminalContainerTheme(
  container: HTMLElement,
  themeKey?: string,
): void {
  const resolved = resolveTerminalTheme(themeKey);
  container.style.background =
    resolved.theme.background ??
    TERMINAL_THEMES[FALLBACK_TERMINAL_THEME_KEY].theme.background ??
    "#1a1a1a";
  container.dataset.terminalTheme = resolved.key;
}

function normalizeGeminiInvalidCommandHelp(output: string): string {
  if (!output.includes("gemini --help")) return output;
  if (!/\b(?:unknown|invalid)\s+command\b/i.test(output)) return output;
  return output.replace(/\bgemini\s+--help\b/g, "gemini help");
}

function writeCliFallbackHint(term: Terminal, originalCommand: string): void {
  const normalized = originalCommand.toLowerCase();
  if (normalized === "claude") {
    term.write(`\x1b[33m  Claude Code CLI not found — opened a shell instead.\x1b[0m\r\n`);
    term.write(`\x1b[33m  Install it:  npm install -g @anthropic-ai/claude-code\x1b[0m\r\n`);
    term.write(`\x1b[33m  More info:   https://docs.anthropic.com/en/docs/claude-code\x1b[0m\r\n\r\n`);
    return;
  }
  if (normalized === "codex") {
    term.write(`\x1b[33m  Codex CLI not found — opened a shell instead.\x1b[0m\r\n`);
    term.write(`\x1b[33m  Install Codex CLI and ensure "codex" is on your PATH.\x1b[0m\r\n\r\n`);
    return;
  }
  if (normalized === "gemini") {
    term.write(`\x1b[33m  Gemini CLI not found — opened a shell instead.\x1b[0m\r\n`);
    term.write(`\x1b[33m  Install Gemini CLI and ensure "gemini" is on your PATH.\x1b[0m\r\n\r\n`);
    return;
  }
  term.write(`\x1b[33m  "${originalCommand}" not found — opened a shell instead.\x1b[0m\r\n\r\n`);
}

export function TerminalPanel({
  terminalId,
  cwd,
  wsRef,
  envOverrides,
  wsVersion,
  command,
  args,
  pendingPrompt,
  onPromptConsumed,
  isActive,
}: TerminalPanelProps) {
  const { data: settings } = useSettings();
  const appearance = settings?.terminalAppearance ?? {};
  const isLightTheme =
    resolveTerminalThemeKey(appearance.theme ?? DEFAULT_APPEARANCE.theme) ===
    "light";
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;
  const bellStyleRef = useRef<"visual" | "badge" | "none">(
    (appearance.bellStyle ??
      DEFAULT_APPEARANCE.bellStyle ??
      "visual") as "visual" | "badge" | "none",
  );
  bellStyleRef.current = (appearance.bellStyle ??
    DEFAULT_APPEARANCE.bellStyle ??
    "visual") as "visual" | "badge" | "none";

  const [searchVisible, setSearchVisible] = useState(false);
  const [bellFlash, setBellFlash] = useState(false);
  const [copyModeActive, setCopyModeActive] = useState(false);
  const copyModeRef = useRef(false);
  // Sync ref in effect to satisfy react-hooks/refs lint rule
  useEffect(() => { copyModeRef.current = copyModeActive; }, [copyModeActive]);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const initedRef = useRef(false);
  const exitedRef = useRef(false);
  const ptyCreateSentRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptSentRef = useRef(false);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bootWsVersionRef = useRef(0);
  const terminalLifecycleStateRef = useRef<
    "active" | "exited" | "dead" | "unknown"
  >("unknown");
  const liveOutputSeenRef = useRef(false);

  // Ref for terminalId — read from closures to avoid stale captures
  // when React reuses the component instance with a different terminalId prop
  const terminalIdRef = useRef(terminalId);
  terminalIdRef.current = terminalId;
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const envOverridesRef = useRef(envOverrides);
  envOverridesRef.current = envOverrides;
  const commandRef = useRef(command);
  commandRef.current = command;
  const argsRef = useRef(args);
  argsRef.current = args;

  const sendWs = useCallback(
    (data: unknown): boolean => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
        return true;
      }
      return false;
    },
    [wsRef],
  );

  // Global find shortcut for the active terminal.
  // This keeps Ctrl/Cmd+F working even when focus is outside xterm's hidden textarea.
  useEffect(() => {
    if (!isActive) return;

    const onKeyDown = (ev: KeyboardEvent) => {
      if (!(ev.metaKey || ev.ctrlKey) || ev.shiftKey) return;
      if (ev.key.toLowerCase() !== "f") return;

      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTextInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (isTextInput) return;

      ev.preventDefault();
      setSearchVisible(true);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isActive]);

  // Keep refs in sync for the settle-detection closure
  const pendingPromptRef = useRef(pendingPrompt);
  pendingPromptRef.current = pendingPrompt;
  const onPromptConsumedRef = useRef(onPromptConsumed);
  onPromptConsumedRef.current = onPromptConsumed;

  // Register for PTY output via the terminal registry.
  // Map.set() guarantees exactly one handler per terminalId —
  // immune to HMR listener leaks and WS reconnect races.
  useEffect(() => {
    promptSentRef.current = false;
    terminalLifecycleStateRef.current = "unknown";
    liveOutputSeenRef.current = false;
    registerTerminalHandler(terminalId, (msg) => {
      const term = termRef.current;
      if (!term) return;
      try {
        if (msg.type === "pty:spawn-fallback") {
          const origCmd = (msg as { originalCommand?: string }).originalCommand ?? "command";
          writeCliFallbackHint(term, origCmd);
          return;
        }
        if (msg.type === "pty:error") {
          term.write(`\r\n\x1b[31m  Terminal error: ${(msg as { error?: string }).error ?? "unknown"}\x1b[0m\r\n`);
          return;
        }
        if (msg.type === "pty:output" && msg.data) {
          liveOutputSeenRef.current = true;
          const output = normalizeGeminiInvalidCommandHelp(msg.data);
          exitedRef.current = false;
          term.write(output);

          // Transition terminal state once per lifecycle edge.
          if (terminalLifecycleStateRef.current !== "active") {
            terminalLifecycleStateRef.current = "active";
            try {
              useConsoleLayoutStore
                .getState()
                .updateTerminalMeta(terminalId, { terminalState: "active" });
            } catch {}
          }

          // Track OSC 133 prompt marks
          if (parseOsc133(output)) {
            const t = promptTrackers.get(terminalId);
            if (t) {
              // Current cursor line in buffer = baseY + cursorY
              const bufLine = term.buffer.active.baseY + term.buffer.active.cursorY;
              t.addMark(bufLine);
            }
          }

          // Output-settle detection: after CLI output goes quiet for 500ms,
          // send the pending prompt (workflow launch)
          if (!promptSentRef.current && pendingPromptRef.current) {
            if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
            settleTimerRef.current = setTimeout(() => {
              if (promptSentRef.current || !pendingPromptRef.current) return;
              const ws = wsRef.current;
              if (!ws || ws.readyState !== WebSocket.OPEN) return; // retry on next output
              promptSentRef.current = true;
              ws.send(
                JSON.stringify({
                  type: "pty:input",
                  terminalId,
                  data: pendingPromptRef.current + "\n",
                }),
              );
              onPromptConsumedRef.current?.();
            }, 500);
          }
        } else if (msg.type === "pty:exit") {
          terminalLifecycleStateRef.current = "exited";
          exitedRef.current = true;
          term.write(
            `\r\n\x1b[90m[Process exited with code ${msg.exitCode ?? 0}]  Press Enter to restart or \u2318W to close\x1b[0m\r\n`,
          );
        } else if (msg.type === "pty:died") {
          terminalLifecycleStateRef.current = "dead";
          term.write(
            `\r\n\x1b[31m[Terminal disconnected — process was terminated]\x1b[0m\r\n`,
          );
        }
      } catch {
        // xterm viewport may not be ready yet (renderer dimensions not initialized)
      }
    });

    // Fallback: if no pty:output arrives within 5s, try sending the prompt anyway.
    // Handles edge cases where Claude starts but doesn't output before showing input.
    if (pendingPromptRef.current) {
      fallbackTimerRef.current = setTimeout(() => {
        if (promptSentRef.current || !pendingPromptRef.current) return;
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        promptSentRef.current = true;
        ws.send(
          JSON.stringify({
            type: "pty:input",
            terminalId,
            data: pendingPromptRef.current + "\n",
          }),
        );
        onPromptConsumedRef.current?.();
      }, 5000);
    }

    return () => {
      unregisterTerminalHandler(terminalId);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, [terminalId, wsRef]);

  // Terminal creation effect — runs once per mount, creates xterm + PTY.
  useEffect(() => {
    if (!containerRef.current || initedRef.current) return;
    initedRef.current = true;

    const container = containerRef.current;
    let term: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let serializeAddon: SerializeAddon | null = null;
    let dataDisposable: { dispose: () => void } | null = null;

    let fileLinkDisposable: { dispose: () => void } | null = null;
    let wrapper: HTMLDivElement | null = null;  
    let ptyCreated = false;
    let disposed = false;

    const safeFit = () => {
      if (disposed || !hasSize(container) || !fitAddon) return;
      try {
        fitAddon.fit();
      } catch {
        /* dimensions not ready */
      }
    };

    const safeProposeDimensions = () => {
      if (disposed || !hasSize(container) || !fitAddon) return null;
      try {
        return fitAddon.proposeDimensions();
      } catch {
        return null;
      }
    };

    /** Open terminal + create PTY — only once container is visible */
    const boot = (retries = 0) => {
      if (disposed || term) return; // already booted or cleaned up

      // ── Cache hit: reparent existing terminal DOM (zero flicker) ──
      const cached = takeCachedTerminal(terminalId);
      if (cached) {
        // Match container background to terminal theme
        const ap = appearanceRef.current;
        applyTerminalContainerTheme(
          container,
          ap.theme ?? DEFAULT_APPEARANCE.theme,
        );
        container.appendChild(cached.wrapper);
        wrapper = cached.wrapper;
        term = cached.term;
        fitAddon = cached.fitAddon;
        serializeAddon = cached.serializeAddon;
        termRef.current = term;
        fitAddonRef.current = fitAddon;
        searchAddonRef.current = cached.searchAddon;
        serializeAddonRef.current = serializeAddon;

        // Refit to new container dimensions (double-rAF lets browser lay out the new container)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            safeFit();
            // Send terminal's actual dimensions after fit (not proposeDimensions,
            // which can drift due to render-service cell metric recalculation)
            if (ptyCreated && term) {
              sendWs({
                type: "pty:resize",
                terminalId: terminalIdRef.current,
                cols: term.cols,
                rows: term.rows,
              });
            }
          });
        });

        // PTY already running — no pty:create needed
        ptyCreated = true;
        ptyCreateSentRef.current = true;

        // Restart auto-save interval
        autoSaveRef.current = setInterval(() => {
          if (disposed || !serializeAddon) return;
          try {
            const data = serializeAddon.serialize();
            if (data && data.length <= MAX_SERIALIZE_BYTES) {
              saveScrollback(terminalIdRef.current, data);
            }
          } catch {}
        }, 30_000);

        // Event handlers (onData, onBell, link providers) survive on the Terminal instance.
        // They reference React refs (wsRef, copyModeRef) which are read lazily — no rebinding needed.
        return;
      }

      const ap = appearanceRef.current;
      const resolvedTheme = resolveTerminalTheme(
        ap.theme ?? DEFAULT_APPEARANCE.theme,
      );
      const t = new Terminal({
        allowProposedApi: true,
        cols: 80,
        rows: 24,
        cursorBlink: ap.cursorBlink ?? DEFAULT_APPEARANCE.cursorBlink,
        cursorStyle: ap.cursorStyle ?? DEFAULT_APPEARANCE.cursorStyle,
        fontSize: ap.fontSize ?? DEFAULT_APPEARANCE.fontSize,
        fontFamily: ap.fontFamily ?? DEFAULT_APPEARANCE.fontFamily,
        lineHeight: ap.lineHeight ?? DEFAULT_APPEARANCE.lineHeight,
        scrollback: ap.scrollback ?? DEFAULT_APPEARANCE.scrollback,
        minimumContrastRatio: ap.minimumContrastRatio ?? DEFAULT_APPEARANCE.minimumContrastRatio,
        // Smart selection: exclude ~ and : from word separators so double-click
        // selects full paths like ~/projects/app:42
        wordSeparator: ' \t()[]{}\'"`',
        theme: resolvedTheme.theme,
      });

      fitAddon = new FitAddon();
      t.loadAddon(fitAddon);

      // xterm's open() can crash if the renderer dimensions aren't ready yet
      // (RenderService.dimensions undefined). Catch and retry after a frame.
      // Use an intermediate wrapper div so we can reparent the terminal DOM
      // into a new container without destroying the xterm canvas/WebGL context.
      // Set container background to match terminal theme so any sub-row gaps
      // at the bottom are invisible (FitAddon can't fill partial rows)
      applyTerminalContainerTheme(
        container,
        ap.theme ?? DEFAULT_APPEARANCE.theme,
      );

      wrapper = document.createElement("div");
      wrapper.style.width = "100%";
      wrapper.style.height = "100%";
      container.appendChild(wrapper);
      try {
        t.open(wrapper);
      } catch {
        t.dispose();
        fitAddon = null;
        if (retries < 3) {
          requestAnimationFrame(() => boot(retries + 1));
        }
        return;
      }

      // Defer WebGL renderer — boot fast with canvas, upgrade after first output.
      // Creating a GPU context blocks the main thread; deferring it lets the terminal
      // accept input immediately while the WebGL upgrade happens in the background.
      setTimeout(() => {
        if (disposed || !t) return;
        try {
          const webglAddon = new WebglAddon();
          webglAddon.onContextLoss(() => { if (!disposed) webglAddon.dispose(); });
          t.loadAddon(webglAddon);
        } catch {
          // WebGL not available, canvas renderer is fine
        }
      }, 150);

      // Search addon (exposed via ref for search UI)
      const searchAddon = new SearchAddon();
      t.loadAddon(searchAddon);
      searchAddonRef.current = searchAddon;

      // Clickable links - Cmd+click to open (iTerm2 behavior)
      const webLinksAddon = new WebLinksAddon((event, uri) => {
        if (event.metaKey || event.ctrlKey) {
          window.open(uri, "_blank");
        }
      });
      t.loadAddon(webLinksAddon);

      // Semantic history — Cmd+click to open file paths in editor
      fileLinkDisposable = t.registerLinkProvider({
        provideLinks(bufferLineNumber, callback) {
          const bufferLine = t.buffer.active.getLine(bufferLineNumber - 1);
          if (!bufferLine) { callback(undefined); return; }
          const text = bufferLine.translateToString(true);

          // Match file paths with optional line:col — e.g. src/foo.ts:42:10, ./bar.py:7
          const fileRegex = /(?:^|\s)((?:\.{0,2}\/)?[\w./-]+\.\w+)(?::(\d+))?(?::(\d+))?/g;
          const links: Array<{
            startIndex: number;
            length: number;
            tooltip: string;
            data: { file: string; line: number; col: number };
          }> = [];

          let m;
          while ((m = fileRegex.exec(text)) !== null) {
            const file = m[1];
            const ln = parseInt(m[2] || "1", 10);
            const col = parseInt(m[3] || "1", 10);
            const startIndex = m.index + (m[0].length - m[0].trimStart().length);
            const fullMatch = `${file}${m[2] ? `:${m[2]}` : ""}${m[3] ? `:${m[3]}` : ""}`;

            links.push({
              startIndex,
              length: fullMatch.length,
              tooltip: `Open ${file} in editor`,
              data: { file, line: ln, col },
            });
          }

          callback(links.length > 0 ? links.map(l => ({
            range: {
              start: { x: l.startIndex + 1, y: bufferLineNumber },
              end: { x: l.startIndex + l.length + 1, y: bufferLineNumber },
            },
            text: l.tooltip,
            activate(_event: MouseEvent, _text: string) {
              const editorCmd = appearanceRef.current.editorCommand ?? "code --goto {file}:{line}:{col}";
              const cmd = editorCmd
                .replace("{file}", l.data.file)
                .replace("{line}", String(l.data.line))
                .replace("{col}", String(l.data.col));

              // Send the editor command via WebSocket to execute on the server
              const ws = wsRef.current;
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: "terminal:exec",
                  command: cmd,
                }));
              }
            },
          })) : undefined);
        },
      });

      // Unicode 11 for proper CJK/emoji width calculation
      const unicode11Addon = new Unicode11Addon();
      t.loadAddon(unicode11Addon);
      t.unicode.activeVersion = "11";

      // Inline images — SIXEL and iTerm2 Inline Image Protocol (IIP)
      try {
        const imageAddon = new ImageAddon({ sixelSupport: true, sixelPaletteLimit: 512, sixelSizeLimit: 10 * 1024 * 1024 });
        t.loadAddon(imageAddon);
      } catch {
        // Image addon not supported (e.g., no WebGL context)
      }

      // Session serialization — save/restore buffer across group switches
      serializeAddon = new SerializeAddon();
      t.loadAddon(serializeAddon);
      serializeAddonRef.current = serializeAddon;

      // Bell handling
      t.onBell(() => {
        const bellStyle = bellStyleRef.current;
        if (bellStyle === "none") return;
        if (bellStyle === "visual" || bellStyle === "badge") {
          // Visual flash
          setBellFlash(true);
          setTimeout(() => setBellFlash(false), 200);
        }
        if (bellStyle === "badge") {
          // Mark activity badge
          try {
            const store = useConsoleLayoutStore.getState();
            store.updateTerminalMeta(terminalId, { hasActivity: true });
          } catch {}
        }
      });

      term = t;
      termRef.current = term;
      fitAddonRef.current = fitAddon;

      // Prompt mark tracking (OSC 133)
      if (!promptTrackers.has(terminalId)) {
        promptTrackers.set(terminalId, new PromptMarkTracker());
      }

      // Fit + create PTY — defer pty:create until renderer is ready
      // Try fit immediately (works if TextMetrics path succeeds synchronously)
      safeFit();

      // Restore serialized buffer from previous mount
      // In-memory cache takes priority (faster, more recent), IndexedDB as fallback
      // Buffer restore can happen before pty:create (xterm buffers writes)
      const savedBuffer = takeSerializedBuffer(terminalId);
      if (savedBuffer) {
        t.write(savedBuffer);
      } else {
        // Async fallback: load from IndexedDB (survives page refresh)
        loadScrollback(terminalId).then((idbBuffer) => {
          if (idbBuffer && !disposed && t && !liveOutputSeenRef.current) {
            t.write(idbBuffer);
          }
        });
      }

      ptyCreated = true;
      bootWsVersionRef.current = wsVersion ?? 0;

      // Build base payload (without dims — those come from renderer)
      const basePayload = {
        type: "pty:create" as const,
        terminalId,
        cwd: cwdRef.current,
        logging:
          ap.sessionLogging ?? DEFAULT_APPEARANCE.sessionLogging ?? false,
        ...(envOverridesRef.current &&
        Object.keys(envOverridesRef.current).length > 0
          ? { env: envOverridesRef.current }
          : {}),
        ...(commandRef.current ? { command: commandRef.current } : {}),
        ...(argsRef.current && argsRef.current.length > 0
          ? { args: argsRef.current }
          : {}),
      };

      const sendCreate = () => {
        if (disposed) return;
        safeFit();
        const dims = safeProposeDimensions();
        const createPayload = {
          ...basePayload,
          cols: dims?.cols ?? term?.cols ?? 80,
          rows: dims?.rows ?? 24,
        };
        const sent = sendWs(createPayload);
        ptyCreateSentRef.current = sent;

        if (!sent) {
          // WS not ready yet — retry until it opens (up to 5s)
          let retryAttempts = 0;
          const retryTimer = setInterval(() => {
            retryAttempts++;
            if (disposed) { clearInterval(retryTimer); return; }
            // Re-measure: layout may have shifted since boot
            const freshDims = safeProposeDimensions();
            const ok = sendWs({
              ...createPayload,
              cols: freshDims?.cols ?? term?.cols ?? createPayload.cols,
              rows: freshDims?.rows ?? term?.rows ?? createPayload.rows,
            });
            if (ok || retryAttempts >= 25) {
              clearInterval(retryTimer);
              if (ok) ptyCreateSentRef.current = true;
            }
          }, 200);
        }
      };

      // Wait for renderer to be ready before sending pty:create.
      // onRender fires after the first render pass — cell metrics are valid
      // and proposeDimensions() returns correct values.
      let createSent = false;
      const renderDisposable = t.onRender(() => {
        if (createSent) return;
        createSent = true;
        renderDisposable.dispose();
        sendCreate();
      });

      // Safety: if onRender hasn't fired within 1s (e.g., terminal is hidden),
      // send pty:create anyway with best-effort dims to avoid being stuck
      setTimeout(() => {
        if (createSent) return;
        createSent = true;
        renderDisposable.dispose();
        sendCreate();
      }, 1000);

      // Periodic auto-save: serialize to IndexedDB every 30s
      autoSaveRef.current = setInterval(() => {
        if (disposed || !serializeAddon) return;
        try {
          const data = serializeAddon.serialize();
          if (data && data.length <= MAX_SERIALIZE_BYTES) {
            saveScrollback(terminalIdRef.current, data);
          }
        } catch {
          // Serialization may fail if terminal is in bad state
        }
      }, 30_000);

      // User input → PTY (sendWs reads wsRef.current, so survives reconnect)
      // Suppressed when copy mode is active — vim keys should not reach the shell
      dataDisposable = term.onData((data) => {
        if (copyModeRef.current) return;
        sendWs({ type: "pty:input", terminalId: terminalIdRef.current, data });
      });

      t.attachCustomKeyEventHandler((ev) => {
        // Cmd+Shift+C toggles copy mode
        if ((ev.metaKey || ev.ctrlKey) && ev.shiftKey && ev.key === "C" && ev.type === "keydown") {
          setCopyModeActive((prev) => !prev);
          return false;
        }
        // Cmd+F opens search
        if ((ev.metaKey || ev.ctrlKey) && ev.key === "f" && ev.type === "keydown") {
          setSearchVisible(true);
          return false; // prevent default browser search
        }
        // Cmd/Ctrl+Shift+K clears terminal viewport + scrollback (iTerm2-style)
        if ((ev.metaKey || ev.ctrlKey) && ev.shiftKey && ev.key.toLowerCase() === "k" && ev.type === "keydown") {
          t.clear();
          return false;
        }
        // Track paste for paste history
        if ((ev.metaKey || ev.ctrlKey) && ev.key === "v" && !ev.shiftKey && ev.type === "keydown") {
          navigator.clipboard.readText().then(text => {
            if (text) recordPaste(text);
          }).catch(() => {});
          return true; // let xterm handle the actual paste
        }
        // Cmd+= / Cmd++ increase font size
        if ((ev.metaKey || ev.ctrlKey) && (ev.key === "=" || ev.key === "+") && ev.type === "keydown") {
          const current = t.options.fontSize ?? 13;
          if (current < 24) {
            t.options.fontSize = current + 1;
            fitAddon?.fit();
            const dims = safeProposeDimensions();
            if (dims) sendWs({ type: "pty:resize", terminalId: terminalIdRef.current, cols: dims.cols, rows: dims.rows });
          }
          return false;
        }
        // Cmd+- decrease font size
        if ((ev.metaKey || ev.ctrlKey) && ev.key === "-" && ev.type === "keydown") {
          const current = t.options.fontSize ?? 13;
          if (current > 8) {
            t.options.fontSize = current - 1;
            fitAddon?.fit();
            const dims = safeProposeDimensions();
            if (dims) sendWs({ type: "pty:resize", terminalId: terminalIdRef.current, cols: dims.cols, rows: dims.rows });
          }
          return false;
        }
        // Cmd+0 reset font size
        if ((ev.metaKey || ev.ctrlKey) && ev.key === "0" && ev.type === "keydown") {
          t.options.fontSize = appearanceRef.current.fontSize ?? DEFAULT_APPEARANCE.fontSize;
          fitAddon?.fit();
          const dims = safeProposeDimensions();
          if (dims) sendWs({ type: "pty:resize", terminalId: terminalIdRef.current, cols: dims.cols, rows: dims.rows });
          return false;
        }
        // Cmd+Up — jump to previous prompt (OSC 133)
        if ((ev.metaKey || ev.ctrlKey) && ev.key === "ArrowUp" && ev.type === "keydown") {
          const tracker = promptTrackers.get(terminalIdRef.current);
          if (tracker) {
            const currentLine = t.buffer.active.baseY + t.buffer.active.cursorY;
            const prev = tracker.findPrevious(currentLine);
            if (prev !== null) {
              t.scrollToLine(prev);
            }
          }
          return false;
        }
        // Cmd+Down — jump to next prompt (OSC 133)
        if ((ev.metaKey || ev.ctrlKey) && ev.key === "ArrowDown" && ev.type === "keydown") {
          const tracker = promptTrackers.get(terminalIdRef.current);
          if (tracker) {
            const currentLine = t.buffer.active.baseY + t.buffer.active.cursorY;
            const next = tracker.findNext(currentLine);
            if (next !== null) {
              t.scrollToLine(next);
            }
          }
          return false;
        }
        // When terminal has exited, Enter restarts the shell
        if (exitedRef.current && ev.type === "keydown" && ev.key === "Enter") {
          exitedRef.current = false;
          terminalLifecycleStateRef.current = "active";
          // Update lifecycle state: active + increment restartCount
          try {
            const store = useConsoleLayoutStore.getState();
            const currentMeta = store.terminals[terminalId];
            store.updateTerminalMeta(terminalId, {
              terminalState: "active",
              restartCount: (currentMeta?.restartCount ?? 0) + 1,
            });
          } catch {}
          // Clear screen and restart
          t.clear();
          t.write("\x1b[2J\x1b[H"); // clear screen
          sendWs({
            type: "pty:create",
            terminalId,
            cwd: cwdRef.current,
            cols: fitAddonRef.current?.proposeDimensions()?.cols ?? 80,
            rows: fitAddonRef.current?.proposeDimensions()?.rows ?? 24,
            logging:
              appearanceRef.current.sessionLogging ??
              DEFAULT_APPEARANCE.sessionLogging ??
              false,
            ...(envOverridesRef.current &&
            Object.keys(envOverridesRef.current).length > 0
              ? { env: envOverridesRef.current }
              : {}),
            ...(commandRef.current ? { command: commandRef.current } : {}),
            ...(argsRef.current && argsRef.current.length > 0
              ? { args: argsRef.current }
              : {}),
          });
          return false; // prevent default
        }
        // Let global shortcuts pass through — handled by window capture listener
        if ((ev.metaKey || ev.ctrlKey) && ev.type === "keydown") {
          const k = ev.key.toLowerCase();
          if (
            k === "n" || k === "t" || k === "w" || k === "d" ||
            k === "k" || k === "\\" || k === "[" || k === "]"
          ) {
            return false;
          }
        }
        return true;
      });
    };

    // ResizeObserver — also used to detect when a hidden container becomes visible
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (disposed) return;
        if (!term) {
          // Terminal hasn't booted yet — try now that container may be visible
          if (hasSize(container)) boot();
          return;
        }
        // Skip if container is hidden (zero dimensions) — fit would produce wrong sizes
        if (!hasSize(container)) return;
        safeFit();
        // Send terminal's actual dimensions after fit (not proposeDimensions,
        // which can drift due to render-service cell metric recalculation)
        if (ptyCreated && term) {
          sendWs({
            type: "pty:resize",
            terminalId: terminalIdRef.current,
            cols: term.cols,
            rows: term.rows,
          });
        }
      }, 50);
    });
    observer.observe(container);

    // Defer boot to next frame so the container is painted before xterm
    // tries to measure renderer dimensions (avoids RenderService.dimensions crash)
    let bootRaf: number | undefined;
    if (hasSize(container)) {
      bootRaf = requestAnimationFrame(() => boot());
    }

    return () => {
      disposed = true;
      if (bootRaf != null) cancelAnimationFrame(bootRaf);
      clearTimeout(resizeTimeout);
      observer.disconnect();

      if (autoSaveRef.current) {
        clearInterval(autoSaveRef.current);
        autoSaveRef.current = null;
      }

      // Don't send pty:close on unmount — orphan timeout handles cleanup.
      // Explicit close is sent only from the removeTerminalTab / closePane actions.
      if (term) {
        // Determine: structural unmount (tree restructure) vs real close (terminal removed)
        const state = useConsoleLayoutStore.getState();
        const stillExists = Object.values(state.groups).some(
          (g) => g.terminals[terminalId],
        );

        if (stillExists && wrapper) {
          // ── Structural unmount: cache for reuse ──
          cacheTerminalDom(terminalId, {
            wrapper,
            term,
            fitAddon: fitAddon!,
            serializeAddon: serializeAddon!,
            searchAddon: searchAddonRef.current!,
          });
          wrapper.remove(); // Detach from DOM but keep in memory
          // Do NOT dispose dataDisposable, fileLinkDisposable, or term
          // — event handlers survive on the cached instance
        } else {
          // ── Real close: dispose everything ──
          dataDisposable?.dispose();
          fileLinkDisposable?.dispose();
          try {
            const serialized = serializeAddon?.serialize();
            if (serialized && setSerializedBuffer(terminalId, serialized)) {
              saveScrollback(terminalId, serialized);
            }
          } catch {}
          term.dispose();
          disposeTerminalDomCache(terminalId);
        }

        termRef.current = null;
        fitAddonRef.current = null;
        searchAddonRef.current = null;
        serializeAddonRef.current = null;
      }
      initedRef.current = false;
      ptyCreateSentRef.current = false;
    };
  }, [terminalId, sendWs]);

  // Apply terminal appearance updates live to already-open terminals.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const ap = appearanceRef.current;
    term.options.cursorBlink = ap.cursorBlink ?? DEFAULT_APPEARANCE.cursorBlink;
    term.options.cursorStyle = ap.cursorStyle ?? DEFAULT_APPEARANCE.cursorStyle;
    term.options.fontSize = ap.fontSize ?? DEFAULT_APPEARANCE.fontSize;
    term.options.fontFamily = ap.fontFamily ?? DEFAULT_APPEARANCE.fontFamily;
    term.options.lineHeight = ap.lineHeight ?? DEFAULT_APPEARANCE.lineHeight;
    term.options.scrollback = ap.scrollback ?? DEFAULT_APPEARANCE.scrollback;
    term.options.minimumContrastRatio =
      ap.minimumContrastRatio ?? DEFAULT_APPEARANCE.minimumContrastRatio;
    const resolvedTheme = resolveTerminalTheme(
      ap.theme ?? DEFAULT_APPEARANCE.theme,
    );
    term.options.theme = resolvedTheme.theme;

    const container = containerRef.current;
    if (container) {
      applyTerminalContainerTheme(container, resolvedTheme.key);
    }

    try {
      if (fitAddonRef.current && hasSize(containerRef.current)) {
        fitAddonRef.current.fit();
      }
    } catch {
      // Render dimensions can be temporarily unavailable during layout transitions.
    }

    sendWs({
      type: "pty:resize",
      terminalId: terminalIdRef.current,
      cols: term.cols,
      rows: term.rows,
    });
  }, [settings?.terminalAppearance, sendWs]);

  // Focus the xterm instance when this pane becomes active.
  // Uses polling retry because termRef.current may be null during the initial
  // async boot (deferred via rAF). Without polling, new terminals don't get
  // focus until the user clicks.
  useEffect(() => {
    if (!isActive) {
      // Blur immediately so stray keystrokes don't reach this terminal
      // during tab-switch transitions
      termRef.current?.textarea?.blur();
      return;
    }
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const rafId = requestAnimationFrame(() => {
      // Refit when tab becomes active — the container may have changed size
      // while this terminal was hidden (e.g. window resize, split change).
      // safeFit() is guarded by hasSize(>=50px) so it won't fit at
      // transitional/collapsed sizes.
      const term = termRef.current;
      const fitTo = () => {
        try {
          if (fitAddonRef.current && hasSize(containerRef.current)) {
            fitAddonRef.current.fit();
          }
        } catch { /* dims not ready */ }
      };
      if (term) {
        fitTo();
      term.focus();
      sendWs({
        type: "pty:resize",
        terminalId: terminalIdRef.current,
        cols: term.cols,
        rows: term.rows,
      });
      return;
      }
      let attempts = 0;
      pollTimer = setInterval(() => {
        attempts++;
        const t = termRef.current;
        if (t) {
          fitTo();
          t.focus();
          sendWs({
            type: "pty:resize",
            terminalId: terminalIdRef.current,
            cols: t.cols,
            rows: t.rows,
          });
          clearInterval(pollTimer!);
          pollTimer = null;
        } else if (attempts >= 20) {
          clearInterval(pollTimer!);
          pollTimer = null;
        }
      }, 100);
    });
    return () => {
      cancelAnimationFrame(rafId);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [isActive, sendWs]);

  // Keep focus stable for active terminals on cwd updates.
  // CWD changes are metadata updates and should not require user re-clicking.
  useEffect(() => {
    if (!isActive) return;
    const id = requestAnimationFrame(() => {
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [cwd, isActive]);

  // Save scrollback to IndexedDB on page unload (fire-and-forget)
  useEffect(() => {
    const onUnload = () => {
      const addon = serializeAddonRef.current;
      if (!addon) return;
      try {
        const data = addon.serialize();
        if (data && data.length <= MAX_SERIALIZE_BYTES) {
          saveScrollback(terminalIdRef.current, data);
        }
      } catch {
        // Best-effort — page is closing
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // Re-send pty:create whenever WS (re)connects.
  // Handles: boot()'s initial pty:create being silently dropped because WS
  // wasn't open yet (common on hard refresh), and PTY recovery after server restart.
  // handleCreate on the server is idempotent — skips spawn if PTY already exists.
  //
  // Retry with short delay: boot() and WS connect race each other — if the WS
  // connects before boot() finishes, termRef is null and we'd bail. The retry
  // covers this window so the pty:create isn't permanently lost.
  useEffect(() => {
    if (!wsVersion) return;
    // Only re-send pty:create on reconnect if we already sent it before
    if (!ptyCreateSentRef.current) return;
    // Skip if this is the same WS connection that boot() already used
    if (wsVersion === bootWsVersionRef.current) return;

    const sendCreate = () => {
      if (!termRef.current || !fitAddonRef.current) return false;
      try {
        const dims = fitAddonRef.current.proposeDimensions();
        sendWs({
          type: "pty:create",
          terminalId,
          cwd: cwdRef.current,
          cols: dims?.cols ?? 80,
          rows: dims?.rows ?? 24,
          logging:
            appearanceRef.current.sessionLogging ??
            DEFAULT_APPEARANCE.sessionLogging ??
            false,
          ...(envOverridesRef.current &&
          Object.keys(envOverridesRef.current).length > 0
            ? { env: envOverridesRef.current }
            : {}),
          ...(commandRef.current ? { command: commandRef.current } : {}),
          ...(argsRef.current && argsRef.current.length > 0
            ? { args: argsRef.current }
            : {}),
        });
        return true;
      } catch {
        return false;
      }
    };

    if (sendCreate()) return;

    // Terminal not ready yet — retry a few times to cover the boot() race
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (sendCreate() || attempts >= 10) clearInterval(timer);
    }, 200);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsVersion]);

  const pasteHistoryOpen = useConsoleLayoutStore((s) => s.pasteHistoryOpen);
  const setPasteHistoryOpen = useConsoleLayoutStore((s) => s.setPasteHistoryOpen);
  const focusRequestSeq = useConsoleLayoutStore((s) => s.focusRequestSeq);

  // Explicit focus requests from session/group switch handlers.
  // This covers cases where browser focus moved to sidebar controls but
  // active pane identity did not change.
  useEffect(() => {
    if (!isActive) return;
    const id = requestAnimationFrame(() => {
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [focusRequestSeq, isActive]);

  const handlePasteFromHistory = useCallback(
    (text: string) => {
      sendWs({ type: "pty:input", terminalId: terminalIdRef.current, data: text });
    },
    [sendWs],
  );

  return (
    <div className="relative h-full w-full" onClick={() => termRef.current?.focus()}>
      {bellFlash && (
        <div
          className={`absolute inset-0 pointer-events-none z-10 animate-pulse ${
            isLightTheme ? "bg-black/10" : "bg-white/10"
          }`}
        />
      )}
      <TerminalSearch
        searchAddon={searchAddonRef.current}
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
      />
      <PasteHistoryPanel
        visible={pasteHistoryOpen}
        onClose={() => setPasteHistoryOpen(false)}
        onPaste={handlePasteFromHistory}
      />
      {copyModeActive && termRef.current && (
        <CopyModeOverlay
          terminal={termRef.current}
          onExit={() => setCopyModeActive(false)}
          onOpenSearch={() => {
            setSearchVisible(true);
          }}
        />
      )}
      <div ref={containerRef} className="h-full w-full terminal-container" />
    </div>
  );
}
