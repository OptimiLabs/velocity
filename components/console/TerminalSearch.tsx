"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, ChevronUp, ChevronDown, Regex } from "lucide-react";
import type { SearchAddon } from "@xterm/addon-search";

interface TerminalSearchProps {
  searchAddon: SearchAddon | null;
  visible: boolean;
  onClose: () => void;
}

export function TerminalSearch({
  searchAddon,
  visible,
  onClose,
}: TerminalSearchProps) {
  const [query, setQuery] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [matchInfo, setMatchInfo] = useState<{
    resultIndex: number;
    resultCount: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when search becomes visible
  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [visible]);

  // Listen for match results from search addon
  useEffect(() => {
    if (!searchAddon) return;
    const disposable = searchAddon.onDidChangeResults((e) => {
      setMatchInfo(e);
    });
    return () => disposable.dispose();
  }, [searchAddon]);

  const doSearch = useCallback(
    (direction: "next" | "previous") => {
      if (!searchAddon || !query) return;
      const opts = {
        regex: useRegex,
        caseSensitive: false,
        incremental: direction === "next",
      };
      if (direction === "next") {
        searchAddon.findNext(query, opts);
      } else {
        searchAddon.findPrevious(query, opts);
      }
    },
    [searchAddon, query, useRegex],
  );

  // Search on query/regex change
  useEffect(() => {
    if (query) {
      doSearch("next");
    } else {
      searchAddon?.clearDecorations();
      setMatchInfo(null);
    }
  }, [query, useRegex, doSearch, searchAddon]);

  const handleClose = useCallback(() => {
    searchAddon?.clearDecorations();
    setMatchInfo(null);
    onClose();
  }, [searchAddon, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        doSearch(e.shiftKey ? "previous" : "next");
      }
    },
    [handleClose, doSearch],
  );

  if (!visible) return null;

  return (
    <div className="absolute top-1 right-2 z-20 flex items-center gap-1 bg-card border border-border rounded-md px-2 py-1 shadow-lg">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search…"
        className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none w-40"
        spellCheck={false}
      />
      {matchInfo && query && (
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {matchInfo.resultCount > 0
            ? `${matchInfo.resultIndex + 1} of ${matchInfo.resultCount}`
            : "No results"}
        </span>
      )}
      <button
        onClick={() => setUseRegex(!useRegex)}
        className={`p-0.5 rounded transition-colors ${
          useRegex
            ? "bg-primary/20 text-primary"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title="Toggle regex"
      >
        <Regex className="w-3 h-3" />
      </button>
      <button
        onClick={() => doSearch("previous")}
        className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
        title="Previous match (Shift+Enter)"
      >
        <ChevronUp className="w-3 h-3" />
      </button>
      <button
        onClick={() => doSearch("next")}
        className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
        title="Next match (Enter)"
      >
        <ChevronDown className="w-3 h-3" />
      </button>
      <button
        onClick={handleClose}
        className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
        title="Close (Esc)"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
