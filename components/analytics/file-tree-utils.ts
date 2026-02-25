import type { DataUtilizationFile } from "@/hooks/useAnalytics";

export interface FileTreeNode {
  name: string;
  fullPath: string;
  isFile: boolean;
  children: FileTreeNode[];
  file?: DataUtilizationFile;
  totalReads: number;
  sessionCount: number;
  estimatedTokens: number;
  estimatedCost: number;
  fileCount: number;
  sizeBytes: number;
}

export interface RepoGroup {
  projectName: string;
  projectPath: string;
  root: FileTreeNode;
  totalReads: number;
  estimatedTokens: number;
  estimatedCost: number;
  fileCount: number;
}

/**
 * Build a trie from path segments, then collapse single-child dirs,
 * compute aggregates bottom-up, and sort dirs-first + alphabetical.
 */
export function buildTree(
  files: DataUtilizationFile[],
  stripPrefix: string,
): FileTreeNode {
  const root: FileTreeNode = {
    name: "",
    fullPath: "",
    isFile: false,
    children: [],
    totalReads: 0,
    sessionCount: 0,
    estimatedTokens: 0,
    estimatedCost: 0,
    fileCount: 0,
    sizeBytes: 0,
  };

  for (const file of files) {
    let relativePath = file.path;
    if (stripPrefix && relativePath.startsWith(stripPrefix)) {
      relativePath = relativePath.slice(stripPrefix.length);
      if (relativePath.startsWith("/")) relativePath = relativePath.slice(1);
    }

    const segments = relativePath.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      let child = current.children.find(
        (c) => c.name === seg && c.isFile === isLast,
      );

      if (!child) {
        child = {
          name: seg,
          fullPath: segments.slice(0, i + 1).join("/"),
          isFile: isLast,
          children: [],
          file: isLast ? file : undefined,
          totalReads: 0,
          sessionCount: 0,
          estimatedTokens: 0,
          estimatedCost: 0,
          fileCount: 0,
          sizeBytes: 0,
        };
        current.children.push(child);
      }

      if (isLast) {
        child.totalReads = file.totalReads;
        child.sessionCount = file.sessionCount;
        child.estimatedTokens = file.estimatedTokens;
        child.estimatedCost = file.estimatedCost;
        child.fileCount = 1;
      }

      current = child;
    }
  }

  // Collapse single-child directories
  collapseSingleChildren(root);

  // Aggregate bottom-up
  aggregateNode(root);

  // Sort: dirs first, then files, alphabetically within each group
  sortChildren(root);

  return root;
}

function collapseSingleChildren(node: FileTreeNode): void {
  for (const child of node.children) {
    collapseSingleChildren(child);
  }

  // Collapse: if a dir has exactly one child and that child is also a dir,
  // merge them into a single node
  if (!node.isFile && node.children.length === 1 && !node.children[0].isFile) {
    const child = node.children[0];
    node.name = node.name ? `${node.name}/${child.name}` : child.name;
    node.fullPath = child.fullPath;
    node.children = child.children;
    // Recurse again since the merge may create another single-child scenario
    collapseSingleChildren(node);
  }
}

function aggregateNode(node: FileTreeNode): void {
  if (node.isFile) return;

  let totalReads = 0;
  let sessionCount = 0;
  let estimatedTokens = 0;
  let estimatedCost = 0;
  let fileCount = 0;
  let sizeBytes = 0;

  for (const child of node.children) {
    aggregateNode(child);
    totalReads += child.totalReads;
    sessionCount += child.sessionCount;
    estimatedTokens += child.estimatedTokens;
    estimatedCost += child.estimatedCost;
    fileCount += child.fileCount;
    sizeBytes += child.sizeBytes;
  }

  node.totalReads = totalReads;
  node.sessionCount = sessionCount;
  node.estimatedTokens = estimatedTokens;
  node.estimatedCost = estimatedCost;
  node.fileCount = fileCount;
  node.sizeBytes = sizeBytes;
}

function sortChildren(node: FileTreeNode): void {
  node.children.sort((a, b) => {
    // Dirs first
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    sortChildren(child);
  }
}

/**
 * Group files by project, build a tree per project, and return sorted groups.
 */
export function buildRepoGroups(files: DataUtilizationFile[]): RepoGroup[] {
  // Group by projectPath
  const grouped = new Map<string, DataUtilizationFile[]>();

  for (const file of files) {
    const key = file.projectPath ?? "__other__";
    const list = grouped.get(key);
    if (list) {
      list.push(file);
    } else {
      grouped.set(key, [file]);
    }
  }

  const groups: RepoGroup[] = [];

  for (const [key, groupFiles] of grouped) {
    const isOther = key === "__other__";
    const projectPath = isOther ? "" : key;
    const projectName = isOther
      ? "Other Files"
      : (groupFiles[0].projectName ??
        projectPath.split("/").pop() ??
        "Unknown");

    const root = buildTree(groupFiles, projectPath);

    groups.push({
      projectName,
      projectPath,
      root,
      totalReads: root.totalReads,
      estimatedTokens: root.estimatedTokens,
      estimatedCost: root.estimatedCost,
      fileCount: root.fileCount,
    });
  }

  // Sort by fileCount descending
  groups.sort((a, b) => b.fileCount - a.fileCount);

  return groups;
}

/**
 * Collect paths of nodes that should be auto-expanded.
 * - First repo is always expanded
 * - Dirs with <= 3 children are auto-expanded
 */
export function getAutoExpandedPaths(groups: RepoGroup[]): Set<string> {
  const paths = new Set<string>();

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const repoKey = `repo:${group.projectPath}`;

    if (gi === 0) {
      paths.add(repoKey);
      autoExpandChildren(group.root, repoKey, paths);
    }
  }

  return paths;
}

function autoExpandChildren(
  node: FileTreeNode,
  prefix: string,
  paths: Set<string>,
): void {
  for (const child of node.children) {
    if (!child.isFile && child.children.length <= 3) {
      const childKey = `${prefix}/${child.fullPath}`;
      paths.add(childKey);
      autoExpandChildren(child, prefix, paths);
    }
  }
}
