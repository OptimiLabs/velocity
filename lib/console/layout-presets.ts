import type { PaneNode } from "@/types/console";

export interface LayoutPreset {
  name: string;
  paneTree: PaneNode;
  createdAt: number;
}

const MAX_SAVED_PRESETS = 10;

export function addSavedPreset(
  presets: LayoutPreset[],
  name: string,
  paneTree: PaneNode,
): LayoutPreset[] {
  const newPreset: LayoutPreset = { name, paneTree, createdAt: Date.now() };
  const updated = [newPreset, ...presets.filter((p) => p.name !== name)];
  return updated.slice(0, MAX_SAVED_PRESETS);
}

export function removeSavedPreset(
  presets: LayoutPreset[],
  name: string,
): LayoutPreset[] {
  return presets.filter((p) => p.name !== name);
}
