"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Terminal } from "@xterm/xterm";

interface CopyModeOverlayProps {
  terminal: Terminal;
  onExit: () => void;
  onOpenSearch: () => void;
}

type SelectionMode = "none" | "char" | "line";

interface CursorPos {
  col: number;
  row: number; // absolute row in buffer (baseY + viewportRow)
}

const WORD_SEPARATORS = " \t()[]{}'\",;`";

function isWordSeparator(ch: string): boolean {
  return WORD_SEPARATORS.includes(ch);
}

/** Read a single line's text from the terminal buffer */
function getLineText(terminal: Terminal, absRow: number): string {
  const line = terminal.buffer.active.getLine(absRow);
  if (!line) return "";
  return line.translateToString(true);
}

/** Get the total number of lines in the buffer (scrollback + viewport) */
function getTotalLines(terminal: Terminal): number {
  return terminal.buffer.active.length;
}

export function CopyModeOverlay({
  terminal,
  onExit,
  onOpenSearch,
}: CopyModeOverlayProps) {
  const [cursor, setCursor] = useState<CursorPos>(() => ({
    col: terminal.buffer.active.cursorX,
    row: terminal.buffer.active.baseY + terminal.buffer.active.cursorY,
  }));
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("none");
  const [selectionStart, setSelectionStart] = useState<CursorPos | null>(null);
  const [gPending, setGPending] = useState(false);

  const cursorRef = useRef(cursor);
  const selectionModeRef = useRef(selectionMode);
  const selectionStartRef = useRef(selectionStart);
  const gPendingRef = useRef(gPending);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);
  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);
  useEffect(() => {
    selectionStartRef.current = selectionStart;
  }, [selectionStart]);
  useEffect(() => {
    gPendingRef.current = gPending;
  }, [gPending]);

  /** Scroll the terminal viewport to ensure the given absolute row is visible */
  const ensureVisible = useCallback(
    (absRow: number) => {
      const viewportRows = terminal.rows;
      const baseY = terminal.buffer.active.baseY;
      const viewportTop = baseY;
      const viewportBottom = baseY + viewportRows - 1;

      if (absRow < viewportTop) {
        terminal.scrollToLine(absRow);
      } else if (absRow > viewportBottom) {
        terminal.scrollToLine(absRow - viewportRows + 1);
      }
    },
    [terminal],
  );

  /** Update the xterm selection to reflect current cursor/selection state */
  const updateSelection = useCallback(
    (pos: CursorPos, mode: SelectionMode, start: CursorPos | null) => {
      if (mode === "none") {
        // Just highlight the cursor position (1 char)
        terminal.select(pos.col, pos.row, 1);
        return;
      }

      if (!start) return;

      if (mode === "char") {
        // Character selection between start and pos
        const startOffset = start.row * terminal.cols + start.col;
        const endOffset = pos.row * terminal.cols + pos.col;
        const minOffset = Math.min(startOffset, endOffset);
        const maxOffset = Math.max(startOffset, endOffset);
        const selCol = minOffset % terminal.cols;
        const selRow = Math.floor(minOffset / terminal.cols);
        const length = maxOffset - minOffset + 1;
        terminal.select(selCol, selRow, length);
      } else if (mode === "line") {
        // Line selection between start row and current row
        const minRow = Math.min(start.row, pos.row);
        const maxRow = Math.max(start.row, pos.row);
        const lineCount = maxRow - minRow + 1;
        terminal.select(0, minRow, lineCount * terminal.cols);
      }
    },
    [terminal],
  );

  // Update selection whenever cursor or selection state changes
  useEffect(() => {
    updateSelection(cursor, selectionMode, selectionStart);
    ensureVisible(cursor.row);
  }, [cursor, selectionMode, selectionStart, updateSelection, ensureVisible]);

  // Move cursor with clamping
  const moveCursor = useCallback(
    (newCol: number, newRow: number): CursorPos => {
      const totalLines = getTotalLines(terminal);
      const clampedRow = Math.max(0, Math.min(newRow, totalLines - 1));
      const lineText = getLineText(terminal, clampedRow);
      const maxCol = Math.max(0, lineText.length - 1);
      const clampedCol = Math.max(0, Math.min(newCol, maxCol));
      const newPos = { col: clampedCol, row: clampedRow };
      setCursor(newPos);
      return newPos;
    },
    [terminal],
  );

  // Word movement: forward
  const moveWordForward = useCallback((): CursorPos => {
    const pos = cursorRef.current;
    const lineText = getLineText(terminal, pos.row);
    let col = pos.col;
    let row = pos.row;

    // Skip current word (non-separators)
    while (col < lineText.length && !isWordSeparator(lineText[col])) {
      col++;
    }
    // Skip separators
    while (col < lineText.length && isWordSeparator(lineText[col])) {
      col++;
    }

    // If we went past end of line, move to start of next line
    if (col >= lineText.length && row < getTotalLines(terminal) - 1) {
      row++;
      const nextLine = getLineText(terminal, row);
      col = 0;
      // Skip leading whitespace on next line
      while (col < nextLine.length && nextLine[col] === " ") {
        col++;
      }
    }

    return moveCursor(col, row);
  }, [terminal, moveCursor]);

  // Word movement: backward
  const moveWordBackward = useCallback((): CursorPos => {
    const pos = cursorRef.current;
    let col = pos.col;
    let row = pos.row;

    // If at start of line, go to previous line
    if (col === 0 && row > 0) {
      row--;
      const prevLine = getLineText(terminal, row);
      col = Math.max(0, prevLine.length - 1);
    } else {
      col--;
    }

    const currentLineText = getLineText(terminal, row);

    // Skip separators backward
    while (col > 0 && isWordSeparator(currentLineText[col])) {
      col--;
    }
    // Skip word backward
    while (col > 0 && !isWordSeparator(currentLineText[col - 1])) {
      col--;
    }

    return moveCursor(col, row);
  }, [terminal, moveCursor]);

  // Handle yank (copy)
  const handleYank = useCallback(() => {
    const text = terminal.getSelection();
    if (text) {
      navigator.clipboard.writeText(text).catch(() => {
        // clipboard may not be available
      });
    }
    terminal.clearSelection();
    onExit();
  }, [terminal, onExit]);

  // Key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events with modifier keys (except Shift for $, G, V)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      e.preventDefault();
      e.stopPropagation();

      const pos = cursorRef.current;
      const mode = selectionModeRef.current;
      const start = selectionStartRef.current;

      switch (e.key) {
        case "h":
        case "ArrowLeft":
          moveCursor(pos.col - 1, pos.row);
          break;
        case "j":
        case "ArrowDown":
          moveCursor(pos.col, pos.row + 1);
          break;
        case "k":
        case "ArrowUp":
          moveCursor(pos.col, pos.row - 1);
          break;
        case "l":
        case "ArrowRight":
          moveCursor(pos.col + 1, pos.row);
          break;
        case "0":
          moveCursor(0, pos.row);
          break;
        case "$":
          {
            const lineText = getLineText(terminal, pos.row);
            moveCursor(Math.max(0, lineText.length - 1), pos.row);
          }
          break;
        case "g":
          if (gPendingRef.current) {
            // gg — go to first line
            setGPending(false);
            moveCursor(0, 0);
          } else {
            setGPending(true);
            // Clear pending after 500ms
            setTimeout(() => setGPending(false), 500);
          }
          break;
        case "G":
          setGPending(false);
          moveCursor(0, getTotalLines(terminal) - 1);
          break;
        case "w":
          moveWordForward();
          break;
        case "b":
          moveWordBackward();
          break;
        case "v":
          if (mode === "char") {
            // Toggle off character selection
            setSelectionMode("none");
            setSelectionStart(null);
          } else {
            setSelectionMode("char");
            setSelectionStart(mode === "line" && start ? start : { ...pos });
          }
          break;
        case "V":
          if (mode === "line") {
            // Toggle off line selection
            setSelectionMode("none");
            setSelectionStart(null);
          } else {
            setSelectionMode("line");
            setSelectionStart(mode === "char" && start ? start : { ...pos });
          }
          break;
        case "y":
          handleYank();
          break;
        case "/":
          onOpenSearch();
          break;
        case "Escape":
        case "q":
          terminal.clearSelection();
          onExit();
          break;
        default:
          // Clear g pending on any other key
          if (gPendingRef.current) setGPending(false);
          break;
      }
    };

    // Capture phase so we intercept before xterm
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    terminal,
    moveCursor,
    moveWordForward,
    moveWordBackward,
    handleYank,
    onExit,
    onOpenSearch,
  ]);

  // Clean up selection on unmount
  useEffect(() => {
    return () => {
      terminal.clearSelection();
    };
  }, [terminal]);

  const modeLabel =
    selectionMode === "char"
      ? "VISUAL"
      : selectionMode === "line"
        ? "VISUAL LINE"
        : "COPY MODE";

  return (
    <div className="absolute top-1 left-2 z-20 flex items-center gap-2 pointer-events-none select-none">
      <span className="px-2 py-0.5 bg-yellow-500/90 text-black text-[10px] font-bold rounded tracking-wider">
        {modeLabel}
      </span>
      <span className="text-[10px] text-muted-foreground bg-card/80 px-1.5 py-0.5 rounded border border-border">
        {cursor.row}:{cursor.col}
      </span>
      {gPending && (
        <span className="text-[10px] text-yellow-400 bg-card/80 px-1.5 py-0.5 rounded border border-border">
          g...
        </span>
      )}
    </div>
  );
}
