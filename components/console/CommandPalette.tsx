"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Terminal, Settings, Navigation, Info, X } from "lucide-react";
import {
  getCommandsForProvider,
  type CommandDef,
  type CommandCategory,
} from "@/lib/console/commands";
import { useRouter } from "next/navigation";
import { useProviderScopeStore } from "@/stores/providerScopeStore";

const CATEGORY_ICONS: Record<CommandCategory, React.ReactNode> = {
  session: <Terminal size={12} />,
  config: <Settings size={12} />,
  info: <Info size={12} />,
  tools: <Settings size={12} />,
  navigation: <Navigation size={12} />,
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onExecute: (command: string) => void;
}

export function CommandPalette({
  open,
  onClose,
  onExecute,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const providerScope = useProviderScopeStore((s) => s.providerScope);

  const groups = getCommandsForProvider(providerScope, query).map((group) => ({
    category: group.category as CommandCategory,
    commands: group.commands,
  }));

  // Flat list for keyboard nav
  const flatList = groups.flatMap((g) => g.commands);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const execute = useCallback(
    (cmd: CommandDef) => {
      onClose();
      if (cmd.handler === "navigation" && cmd.route) {
        router.push(cmd.route);
      } else if (cmd.event) {
        window.dispatchEvent(new CustomEvent(cmd.event));
      } else {
        onExecute("/" + cmd.name);
      }
    },
    [onClose, onExecute, router],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % flatList.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + flatList.length) % flatList.length);
      return;
    }
    if (e.key === "Enter" && flatList[selectedIndex]) {
      e.preventDefault();
      execute(flatList[selectedIndex]);
    }
  };

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector(
        '[data-selected="true"]',
      ) as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!open) return null;

  let flatIndex = 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-popover border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 border-b border-border">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 h-10 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {groups.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No commands found
            </div>
          ) : (
            groups.map(({ category, commands }) => (
              <div key={category}>
                <div className="px-3 py-1.5 text-meta font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  {CATEGORY_ICONS[category]}
                  {category}
                </div>
                {commands.map((cmd) => {
                  const idx = flatIndex++;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={cmd.name}
                      data-selected={isSelected}
                      onClick={() => execute(cmd)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                        isSelected
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <span className="text-xs font-mono font-medium text-primary w-24 shrink-0">
                        /{cmd.name}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {cmd.description}
                      </span>
                      {cmd.shortcut && (
                        <kbd className="ml-auto text-meta font-mono text-muted-foreground/50 shrink-0">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-border flex items-center gap-3 text-meta text-muted-foreground">
          <span>
            <kbd className="font-mono">↑↓</kbd> Navigate
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> Select
          </span>
          <span>
            <kbd className="font-mono">Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
