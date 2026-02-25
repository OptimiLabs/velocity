import { useState, useRef, useCallback, useEffect } from "react";

interface DirEntry {
  name: string;
  path: string;
}

interface BrowseResponse {
  path: string;
  parent: string | null;
  entries: DirEntry[];
  error?: string;
  homeDir?: string;
}

interface UseDirectoryBrowserOptions {
  initialValue?: string;
  debounceMs?: number;
}

export function useDirectoryBrowser(opts: UseDirectoryBrowserOptions = {}) {
  const { initialValue = "", debounceMs = 200 } = opts;

  const [inputValue, setInputValue] = useState(initialValue);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [showHidden, setShowHidden] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [homeDir, setHomeDir] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchedDir = useRef<string>("");

  // Extract the "directory" portion and "filter" portion from input
  // e.g. "~/projects/my" → dir="~/projects", filter="my"
  // e.g. "~/projects/"   → dir="~/projects", filter=""
  const splitInput = useCallback((value: string) => {
    if (!value) return { dir: "~", filter: "" };
    if (value.endsWith("/"))
      return { dir: value.slice(0, -1) || "/", filter: "" };
    const lastSlash = value.lastIndexOf("/");
    if (lastSlash === -1) return { dir: "~", filter: value };
    return {
      dir: value.slice(0, lastSlash) || "/",
      filter: value.slice(lastSlash + 1),
    };
  }, []);

  const fetchDir = useCallback(async (dirPath: string, hidden: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const url = `/api/filesystem/browse?path=${encodeURIComponent(dirPath)}&showHidden=${hidden}`;
      const res = await fetch(url, { signal: controller.signal });
      const data: BrowseResponse = await res.json();

      if (!controller.signal.aborted) {
        setEntries(data.entries);
        setResolvedPath(data.path);
        setParentPath(data.parent);
        setError(data.error);
        if (data.homeDir) setHomeDir(data.homeDir);
        lastFetchedDir.current = dirPath;
      }
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") {
        setEntries([]);
        setError("Failed to load directory");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  // Debounced fetch when directory portion changes
  const debouncedFetch = useCallback(
    (value: string, hidden: boolean) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      const { dir } = splitInput(value);

      // Only fetch if the directory portion changed
      if (dir !== lastFetchedDir.current) {
        timerRef.current = setTimeout(() => {
          fetchDir(dir, hidden);
        }, debounceMs);
      }
    },
    [splitInput, fetchDir, debounceMs],
  );

  // Client-side filtering of cached entries
  const filteredEntries = (() => {
    const { filter } = splitInput(inputValue);
    if (!filter) return entries;
    const lower = filter.toLowerCase();
    return entries.filter((e) => e.name.toLowerCase().startsWith(lower));
  })();

  // Clamp highlight index when filtered entries change
  useEffect(() => {
    setHighlightIndex((i) =>
      Math.min(i, Math.max(0, filteredEntries.length - 1)),
    );
  }, [filteredEntries.length]);

  // Handle input value changes from the outside (e.g. clicking a project)
  const setValue = useCallback(
    (value: string) => {
      setInputValue(value);
      setHighlightIndex(0);
      if (value) {
        debouncedFetch(value, showHidden);
      }
    },
    [debouncedFetch, showHidden],
  );

  // Handle typing
  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      setHighlightIndex(0);
      setIsOpen(true);
      debouncedFetch(value, showHidden);
    },
    [debouncedFetch, showHidden],
  );

  // Navigate into a directory
  const navigateTo = useCallback(
    (path: string) => {
      const display = path === "/" ? "/" : path + "/";
      setInputValue(display);
      setHighlightIndex(0);
      setIsOpen(true);
      fetchDir(path, showHidden);
    },
    [fetchDir, showHidden, resolvedPath, entries.length],
  );

  // Navigate to parent
  const navigateUp = useCallback(() => {
    if (parentPath) {
      navigateTo(parentPath);
    }
  }, [parentPath, navigateTo]);

  // Toggle hidden files
  const toggleHidden = useCallback(() => {
    const next = !showHidden;
    setShowHidden(next);
    const { dir } = splitInput(inputValue);
    fetchDir(dir || "~", next);
  }, [showHidden, splitInput, inputValue, fetchDir]);

  // Select the currently highlighted entry
  const selectHighlighted = useCallback(() => {
    if (filteredEntries[highlightIndex]) {
      navigateTo(filteredEntries[highlightIndex].path);
    }
  }, [filteredEntries, highlightIndex, navigateTo]);

  // Open the dropdown and fetch if needed
  const open = useCallback(() => {
    setIsOpen(true);
    const { dir } = splitInput(inputValue || "~");
    if (dir !== lastFetchedDir.current) {
      fetchDir(dir, showHidden);
    }
  }, [splitInput, inputValue, fetchDir, showHidden]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    inputValue,
    setInputValue: setValue,
    handleInputChange,
    entries,
    filteredEntries,
    resolvedPath,
    parentPath,
    homeDir,
    loading,
    error,
    showHidden,
    highlightIndex,
    setHighlightIndex,
    isOpen,
    open,
    close,
    navigateTo,
    navigateUp,
    toggleHidden,
    selectHighlighted,
  };
}
