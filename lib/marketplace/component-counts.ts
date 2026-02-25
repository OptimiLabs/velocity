import type { TreeEntry } from "./repo-tree";

export interface ManifestPlugin {
  name: string;
  skills?: string[];
  agents?: string[];
  commands?: string[];
  source?: string;
}

type ComponentCounts = Record<
  string,
  { agents: number; skills: number; commands: number }
>;

const COMPONENT_TYPES = ["agents", "skills", "commands"] as const;
type ComponentType = (typeof COMPONENT_TYPES)[number];

function normalize(p: string): string {
  return p.replace(/^\.\//, "");
}

/**
 * Count agents/skills/commands per plugin using multiple strategies:
 * 1. Manifest paths — if the plugin entry lists explicit paths, validate against tree
 * 2. plugins/<name>/ subdirectory scan — the standard layout
 * 3. Root-level or source-relative directory scan — fallback
 */
export function countPluginComponents(
  tree: TreeEntry[],
  plugins?: ManifestPlugin[],
): ComponentCounts {
  const counts: ComponentCounts = {};
  const blobPaths = new Set<string>();

  for (const item of tree) {
    if (item.type === "blob") blobPaths.add(item.path);
  }

  // Track which plugins got counts from Strategy 1 (manifest paths)
  const resolvedByManifest = new Set<string>();

  // Strategy 1: Manifest paths
  if (plugins) {
    for (const plugin of plugins) {
      let found = false;
      for (const type of COMPONENT_TYPES) {
        const paths = plugin[type];
        if (!Array.isArray(paths) || paths.length === 0) continue;
        if (!counts[plugin.name])
          counts[plugin.name] = { agents: 0, skills: 0, commands: 0 };
        for (const rawPath of paths) {
          const base = normalize(rawPath);
          if (
            blobPaths.has(`${base}/SKILL.md`) ||
            blobPaths.has(`${base}/README.md`)
          ) {
            counts[plugin.name][type]++;
            found = true;
          }
        }
      }
      if (found) resolvedByManifest.add(plugin.name);
    }
  }

  // Strategy 2: plugins/<name>/{agents,skills,commands}/*.md scan
  for (const item of tree) {
    if (item.type !== "blob" || !item.path.startsWith("plugins/")) continue;
    const parts = item.path.split("/");
    if (
      parts.length >= 4 &&
      COMPONENT_TYPES.includes(parts[2] as ComponentType) &&
      parts[parts.length - 1].endsWith(".md")
    ) {
      const pluginName = parts[1];
      if (resolvedByManifest.has(pluginName)) continue;
      if (!counts[pluginName])
        counts[pluginName] = { agents: 0, skills: 0, commands: 0 };
      counts[pluginName][parts[2] as ComponentType]++;
    }
  }

  // Strategy 3: Root-level / source-relative directory scan
  if (plugins) {
    for (const plugin of plugins) {
      // Skip if already resolved
      if (counts[plugin.name]) {
        const c = counts[plugin.name];
        if (c.agents + c.skills + c.commands > 0) continue;
      }

      const prefix = plugin.source ? normalize(plugin.source) + "/" : "";
      let found = false;

      for (const type of COMPONENT_TYPES) {
        const dir = `${prefix}${type}/`;
        for (const p of blobPaths) {
          if (p.startsWith(dir) && p.endsWith(".md")) {
            if (!counts[plugin.name])
              counts[plugin.name] = { agents: 0, skills: 0, commands: 0 };
            counts[plugin.name][type]++;
            found = true;
          }
        }
      }

      // If no source and nothing found at root, skip
      if (!found && !plugin.source) {
        // still nothing — leave as-is (0 or missing)
      }
    }
  }

  return counts;
}
