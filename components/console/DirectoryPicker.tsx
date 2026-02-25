"use client";

import { useRef, useEffect, useCallback } from "react";
import {
  Folder,
  FolderOpen,
  Eye,
  EyeOff,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useDirectoryBrowser } from "@/hooks/useDirectoryBrowser";
import { cn } from "@/lib/utils";

interface DirectoryPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputClassName?: string;
  compact?: boolean;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export function DirectoryPicker({
  value,
  onChange,
  placeholder = "~/projects/my-app",
  inputClassName,
  compact,
  autoFocus,
  onKeyDown: parentKeyDown,
}: DirectoryPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const closingRef = useRef(false);

  const browser = useDirectoryBrowser({ initialValue: value });

  // Sync external value → internal
  useEffect(() => {
    if (value !== browser.inputValue) {
      browser.setInputValue(value);
    }
    // Only sync when external value changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Propagate internal → external
  const handleChange = useCallback(
    (val: string) => {
      browser.handleInputChange(val);
      onChange(val);
    },
    [browser, onChange],
  );

  const handleNavigateTo = useCallback(
    (path: string) => {
      browser.navigateTo(path);
      onChange(path === "/" ? "/" : path + "/");
      inputRef.current?.focus();
    },
    [browser, onChange],
  );

  const handleNavigateUp = useCallback(() => {
    if (browser.parentPath) {
      browser.navigateTo(browser.parentPath);
      onChange(browser.parentPath === "/" ? "/" : browser.parentPath + "/");
      inputRef.current?.focus();
    }
  }, [browser, onChange]);

  // Scroll highlighted item into view
  useEffect(() => {
    const el = itemsRef.current[browser.highlightIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [browser.highlightIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (browser.isOpen && browser.filteredEntries.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          browser.setHighlightIndex(
            (browser.highlightIndex + 1) % browser.filteredEntries.length,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          browser.setHighlightIndex(
            (browser.highlightIndex - 1 + browser.filteredEntries.length) %
              browser.filteredEntries.length,
          );
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          if (browser.filteredEntries[browser.highlightIndex]) {
            handleNavigateTo(
              browser.filteredEntries[browser.highlightIndex].path,
            );
          }
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          if (browser.filteredEntries[browser.highlightIndex]) {
            handleNavigateTo(
              browser.filteredEntries[browser.highlightIndex].path,
            );
          }
          return;
        }
      }

      if (e.key === "Escape" && browser.isOpen) {
        e.preventDefault();
        browser.close();
        return;
      }

      // Backspace at end of `/` → navigate up (only when no text is selected)
      if (e.key === "Backspace" && browser.inputValue.endsWith("/")) {
        const input = inputRef.current;
        const hasSelection =
          input && input.selectionStart !== input.selectionEnd;
        if (!hasSelection) {
          e.preventDefault();
          handleNavigateUp();
          return;
        }
      }

      // ArrowDown opens dropdown when closed
      if (e.key === "ArrowDown" && !browser.isOpen) {
        e.preventDefault();
        browser.open();
        return;
      }

      // Pass through Enter when dropdown is closed (for form submission)
      if (e.key === "Enter" && !browser.isOpen) {
        parentKeyDown?.(e);
        return;
      }

      parentKeyDown?.(e);
    },
    [browser, handleNavigateTo, handleNavigateUp, parentKeyDown],
  );

  const handleFocus = useCallback(() => {
    if (!browser.inputValue) {
      // Start at home directory like opening a terminal
      browser.navigateTo("~");
      onChange("~/");
    } else {
      browser.open();
    }
  }, [browser, onChange]);

  const handleBlur = useCallback(() => {
    // Delay close to allow mousedown on dropdown items
    closingRef.current = true;
    setTimeout(() => {
      if (closingRef.current) {
        browser.close();
        closingRef.current = false;
      }
    }, 150);
  }, [browser]);

  // Build breadcrumb segments from the resolved path or input
  const breadcrumbs = (() => {
    const displayPath = browser.resolvedPath || browser.inputValue;
    if (!displayPath) return [];

    // Convert to ~ prefix for display — split on both / and \ for cross-platform
    const parts = displayPath.split(/[/\\]/).filter(Boolean);
    const segments: { label: string; path: string }[] = [];
    const sep = displayPath.includes("\\") ? "\\" : "/";

    // Check if path starts with the user's home directory
    const isHome =
      browser.homeDir && displayPath.startsWith(browser.homeDir);
    if (isHome) {
      // Count how many segments the home dir has to know where ~ ends
      const homeParts = browser.homeDir!.split(/[/\\]/).filter(Boolean);
      segments.push({
        label: "~",
        path: browser.homeDir!,
      });
      for (let i = homeParts.length; i < parts.length; i++) {
        segments.push({
          label: parts[i],
          path:
            (sep === "/" ? "/" : "") + parts.slice(0, i + 1).join(sep),
        });
      }
    } else {
      segments.push({ label: sep === "/" ? "/" : parts[0] || "/", path: sep === "/" ? "/" : parts[0] + "\\" });
      const start = sep === "/" ? 0 : 1;
      for (let i = start; i < parts.length; i++) {
        segments.push({
          label: parts[i],
          path:
            (sep === "/" ? "/" : "") + parts.slice(0, i + 1).join(sep),
        });
      }
    }

    return segments;
  })();

  return (
    <div className="relative">
      {/* Input with folder icon */}
      <div className="relative">
        <FolderOpen
          size={compact ? 12 : 14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          ref={inputRef}
          value={browser.inputValue}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={cn(
            "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border bg-transparent py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            compact ? "h-7 pl-7 pr-3" : "h-8 pl-8 pr-3",
            inputClassName,
          )}
        />
        {browser.loading && (
          <Loader2
            size={compact ? 10 : 12}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary animate-spin"
          />
        )}
      </div>

      {/* Dropdown */}
      {browser.isOpen && (
        <div
          ref={dropdownRef}
          className={cn(
            "absolute top-full left-0 mt-1 w-full bg-popover border border-border rounded-md shadow-md z-50 flex flex-col",
            compact ? "max-h-[260px]" : "max-h-[340px]",
          )}
          onMouseDown={(e) => {
            // Prevent blur so clicks inside work
            e.preventDefault();
            closingRef.current = false;
          }}
        >
          {/* Breadcrumb navigation */}
          {breadcrumbs.length > 0 && (
            <div className="flex items-center gap-0.5 px-2.5 py-1.5 border-b border-border/50 overflow-x-auto">
              {breadcrumbs.map((seg, i) => (
                <span
                  key={seg.path}
                  className="flex items-center gap-0.5 shrink-0"
                >
                  {i > 0 && (
                    <ChevronRight
                      size={10}
                      className="text-text-quaternary"
                    />
                  )}
                  <button
                    className="text-meta font-mono text-muted-foreground hover:text-foreground transition-colors px-0.5 rounded"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      closingRef.current = false;
                      handleNavigateTo(seg.path);
                    }}
                  >
                    {seg.label}
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Header row: hidden toggle + count */}
          <div className="flex items-center justify-between px-2.5 py-1 border-b border-border/50">
            <button
              className="flex items-center gap-1 text-meta text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                closingRef.current = false;
                browser.toggleHidden();
              }}
            >
              {browser.showHidden ? <EyeOff size={10} /> : <Eye size={10} />}
              <span>{browser.showHidden ? "Hide" : "Show"} hidden</span>
            </button>
            <span className="text-meta text-text-tertiary">
              {browser.filteredEntries.length} director
              {browser.filteredEntries.length === 1 ? "y" : "ies"}
            </span>
          </div>

          {/* Error message */}
          {browser.error && (
            <div className="px-2.5 py-1.5 text-meta text-amber-500/80 bg-amber-500/5">
              {browser.error}
            </div>
          )}

          {/* Directory entries */}
          <div className="flex-1 overflow-y-auto min-h-0 py-0.5">
            {browser.filteredEntries.length === 0 && !browser.loading ? (
              <div className="px-3 py-3 text-center text-meta text-text-tertiary">
                {browser.error
                  ? "No accessible directories"
                  : "Empty directory"}
              </div>
            ) : (
              browser.filteredEntries.map((entry, i) => (
                <button
                  key={entry.path}
                  ref={(el) => {
                    itemsRef.current[i] = el;
                  }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors",
                    i === browser.highlightIndex
                      ? "bg-muted"
                      : "hover:bg-muted/50",
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    closingRef.current = false;
                    handleNavigateTo(entry.path);
                  }}
                  onMouseEnter={() => browser.setHighlightIndex(i)}
                >
                  <Folder
                    size={13}
                    className="text-muted-foreground/50 shrink-0"
                  />
                  <span className="font-mono text-foreground truncate">
                    {entry.name}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
