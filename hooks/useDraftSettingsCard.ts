"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cloneValue<T>(value: T): T {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepMergeObject<T extends Record<string, unknown>>(
  current: T,
  patch: Partial<T>,
): T {
  const next = { ...current } as Record<string, unknown>;
  for (const [key, patchValue] of Object.entries(patch as Record<string, unknown>)) {
    if (patchValue === undefined) {
      delete next[key];
      continue;
    }
    const currentValue = next[key];
    if (isPlainObject(currentValue) && isPlainObject(patchValue)) {
      next[key] = deepMergeObject(currentValue, patchValue);
    } else {
      next[key] = patchValue;
    }
  }
  return next as T;
}

function valueEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function buildTopLevelPatch<T extends Record<string, unknown>>(
  baseline: T,
  draft: T,
): Partial<T> {
  const patch: Partial<T> = {};
  const keys = new Set([...Object.keys(baseline), ...Object.keys(draft)]);
  for (const key of keys) {
    const b = baseline[key];
    const d = draft[key];
    if (!valueEqual(b, d)) {
      (patch as Record<string, unknown>)[key] = d;
    }
  }
  return patch;
}

type SaveState = "idle" | "saving" | "saved" | "error";

interface UseDraftSettingsCardOptions<T extends Record<string, unknown>> {
  source: T | null | undefined;
  onSave: (ctx: { patch: Partial<T>; draft: T; baseline: T }) => Promise<void>;
}

export function useDraftSettingsCard<T extends Record<string, unknown>>({
  source,
  onSave,
}: UseDraftSettingsCardOptions<T>) {
  const [baseline, setBaseline] = useState<T | null>(null);
  const [draft, setDraft] = useState<T | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasIncomingRefresh, setHasIncomingRefresh] = useState(false);

  const isDirty = useMemo(() => {
    if (!baseline || !draft) return false;
    return !valueEqual(baseline, draft);
  }, [baseline, draft]);

  const dirtyKeys = useMemo(() => {
    if (!baseline || !draft) return [] as string[];
    const patch = buildTopLevelPatch(baseline, draft);
    return Object.keys(patch).sort();
  }, [baseline, draft]);

  useEffect(() => {
    if (!source) return;
    const next = cloneValue(source);

    if (!baseline || !draft) {
      setBaseline(next);
      setDraft(next);
      setHasIncomingRefresh(false);
      return;
    }

    if (isDirty) {
      setHasIncomingRefresh(true);
      return;
    }

    if (valueEqual(baseline, next) && valueEqual(draft, next)) {
      return;
    }

    setBaseline(next);
    setDraft(next);
    setHasIncomingRefresh(false);
  }, [source, baseline, draft, isDirty]);

  const patchDraft = useCallback((partial: Partial<T>) => {
    setSaveState((prev) => (prev === "saved" ? "idle" : prev));
    setSaveError(null);
    setDraft((prev) => {
      if (!prev) return prev;
      return deepMergeObject(prev, partial);
    });
  }, []);

  const reset = useCallback(() => {
    if (!baseline) return;
    setDraft(cloneValue(baseline));
    setSaveState("idle");
    setSaveError(null);
    setHasIncomingRefresh(false);
  }, [baseline]);

  const save = useCallback(async () => {
    if (!baseline || !draft) return;
    const patch = buildTopLevelPatch(baseline, draft);
    if (Object.keys(patch).length === 0) {
      setSaveState("saved");
      return;
    }

    setSaveState("saving");
    setSaveError(null);
    try {
      await onSave({ patch, draft, baseline });
      const nextBaseline = cloneValue(draft);
      setBaseline(nextBaseline);
      setDraft(nextBaseline);
      setSaveState("saved");
      setHasIncomingRefresh(false);
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, [baseline, draft, onSave]);

  return {
    baseline,
    draft,
    setDraft,
    patchDraft,
    reset,
    save,
    isDirty,
    dirtyKeys,
    isSaving: saveState === "saving",
    saveState,
    saveError,
    hasIncomingRefresh,
  };
}
