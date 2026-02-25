import type { PaneNode, PaneContent, PaneId } from "@/types/console";

export function findNode(root: PaneNode, id: PaneId): PaneNode | null {
  if (root.id === id) return root;
  if (root.kind === "split") {
    return findNode(root.children[0], id) ?? findNode(root.children[1], id);
  }
  return null;
}

export function replaceNode(
  root: PaneNode,
  targetId: PaneId,
  replacement: PaneNode,
): PaneNode {
  if (root.id === targetId) return replacement;
  if (root.kind === "split") {
    return {
      ...root,
      children: [
        replaceNode(root.children[0], targetId, replacement),
        replaceNode(root.children[1], targetId, replacement),
      ],
    };
  }
  return root;
}

export function splitPane(
  root: PaneNode,
  targetId: PaneId,
  orientation: "horizontal" | "vertical",
  newContent: PaneContent,
): PaneNode {
  const target = findNode(root, targetId);
  if (!target || target.kind !== "leaf") return root;

  const newLeaf: PaneNode = {
    id: `pane-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: "leaf",
    content: newContent,
  };

  const splitNode: PaneNode = {
    id: `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: "split",
    orientation,
    children: [target, newLeaf],
    sizes: [50, 50],
  };

  return replaceNode(root, targetId, splitNode);
}

export function closePane(root: PaneNode, targetId: PaneId): PaneNode | null {
  if (root.id === targetId) return null;
  if (root.kind !== "split") return root;

  if (root.children[0].id === targetId) return root.children[1];
  if (root.children[1].id === targetId) return root.children[0];

  const left = closePane(root.children[0], targetId);
  if (left !== root.children[0]) {
    if (!left) return root.children[1];
    return { ...root, children: [left, root.children[1]] };
  }

  const right = closePane(root.children[1], targetId);
  if (right !== root.children[1]) {
    if (!right) return root.children[0];
    return { ...root, children: [root.children[0], right] };
  }

  return root;
}

export function collectTerminalIds(root: PaneNode): string[] {
  if (root.kind === "leaf") {
    return root.content.type === "terminal" ? [root.content.terminalId] : [];
  }
  return [
    ...collectTerminalIds(root.children[0]),
    ...collectTerminalIds(root.children[1]),
  ];
}

/** Swap two leaf nodes in the tree by exchanging their content and ids */
export function swapPanes(root: PaneNode, idA: PaneId, idB: PaneId): PaneNode {
  if (idA === idB) return root;
  const nodeA = findNode(root, idA);
  const nodeB = findNode(root, idB);
  if (!nodeA || !nodeB || nodeA.kind !== "leaf" || nodeB.kind !== "leaf")
    return root;

  // Swap by replacing each node's content — keep the tree structure stable
  const swap = (n: PaneNode): PaneNode => {
    if (n.id === idA && n.kind === "leaf")
      return { ...n, content: nodeB.content };
    if (n.id === idB && n.kind === "leaf")
      return { ...n, content: nodeA.content };
    if (n.kind === "split") {
      return { ...n, children: [swap(n.children[0]), swap(n.children[1])] };
    }
    return n;
  };
  return swap(root);
}

/**
 * Move a pane from its current position and insert it adjacent to a target pane.
 * The source is removed (sibling takes its place) and then the target is split
 * to accommodate the source in the given direction.
 */
export function movePane(
  root: PaneNode,
  sourceId: PaneId,
  targetId: PaneId,
  position: "left" | "right" | "top" | "bottom",
): PaneNode {
  if (sourceId === targetId) return root;
  const source = findNode(root, sourceId);
  if (!source || source.kind !== "leaf") return root;

  // Step 1: Remove source from tree (sibling replaces parent split)
  const afterRemove = closePane(root, sourceId);
  if (!afterRemove) return root; // source was the only node

  // Step 2: Find target in the modified tree and split it with the source
  const target = findNode(afterRemove, targetId);
  if (!target || target.kind !== "leaf") return root; // target was removed or invalid

  const orientation: "horizontal" | "vertical" =
    position === "left" || position === "right" ? "horizontal" : "vertical";
  const sourceFirst = position === "left" || position === "top";

  const reinsertedSource: PaneNode = { ...source, id: source.id };
  const splitNode: PaneNode = {
    id: `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: "split",
    orientation,
    children: sourceFirst
      ? [reinsertedSource, target]
      : [target, reinsertedSource],
    sizes: [50, 50],
  };

  return replaceNode(afterRemove, targetId, splitNode);
}

/** Collect all leaf pane IDs in left-to-right, top-to-bottom order */
export function collectLeafIds(root: PaneNode): PaneId[] {
  if (root.kind === "leaf") return [root.id];
  return [
    ...collectLeafIds(root.children[0]),
    ...collectLeafIds(root.children[1]),
  ];
}

/** Collect all leaf nodes in DFS order (left-to-right, top-to-bottom) */
export function collectLeaves(root: PaneNode): (PaneNode & { kind: "leaf" })[] {
  if (root.kind === "leaf") return [root];
  return [
    ...collectLeaves(root.children[0]),
    ...collectLeaves(root.children[1]),
  ];
}

/** Find first leaf matching predicate */
export function findLeafByContent(
  root: PaneNode,
  predicate: (c: PaneContent) => boolean,
): (PaneNode & { kind: "leaf" }) | null {
  if (root.kind === "leaf") return predicate(root.content) ? root : null;
  return (
    findLeafByContent(root.children[0], predicate) ??
    findLeafByContent(root.children[1], predicate)
  );
}

/** Lightweight check: does a leaf with the given ID exist in the tree? */
export function paneExists(
  root: PaneNode,
  id: string | null | undefined,
): boolean {
  if (!id) return false;
  if (root.kind === "leaf") return root.id === id;
  return paneExists(root.children[0], id) || paneExists(root.children[1], id);
}

/**
 * Build a balanced grid from N leaf nodes using a sqrt-based row distribution.
 *
 * Layout examples:
 *   1 → [T1]
 *   2 → [T1 / T2]                    (vertical stack)
 *   3 → [T1 / (T2 | T3)]            (top full, bottom split)
 *   4 → [(T1 | T2) / (T3 | T4)]     (2×2)
 *   5 → [(T1 | T2) / (T3 | T4 | T5)]
 */
export function buildBalancedGrid(leaves: PaneNode[]): PaneNode {
  if (leaves.length === 0) return defaultLayout();
  if (leaves.length === 1) return leaves[0];

  const numRows = Math.ceil(Math.sqrt(leaves.length));
  const basePerRow = Math.floor(leaves.length / numRows);
  const extra = leaves.length % numRows;

  // Distribute leaves into rows as evenly as possible
  const rows: PaneNode[][] = [];
  let idx = 0;
  for (let r = 0; r < numRows; r++) {
    // Give extra leaves to later rows so top rows stay simpler
    const count = basePerRow + (r >= numRows - extra ? 1 : 0);
    rows.push(leaves.slice(idx, idx + count));
    idx += count;
  }

  // Build each row as a horizontal split chain
  const rowNodes: PaneNode[] = rows.map((row) => {
    if (row.length === 1) return row[0];
    return row.slice(1).reduce<PaneNode>(
      (acc, node) => ({
        id: `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: "split" as const,
        orientation: "horizontal" as const,
        children: [acc, node] as [PaneNode, PaneNode],
        sizes: [50, 50] as [number, number],
      }),
      row[0],
    );
  });

  // Stack rows vertically
  if (rowNodes.length === 1) return rowNodes[0];
  return rowNodes.slice(1).reduce<PaneNode>(
    (acc, node) => ({
      id: `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: "split" as const,
      orientation: "vertical" as const,
      children: [acc, node] as [PaneNode, PaneNode],
      sizes: [50, 50] as [number, number],
    }),
    rowNodes[0],
  );
}

export function genPaneId(): string {
  return `pane-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultLayout(): PaneNode {
  return {
    id: genPaneId(),
    kind: "leaf",
    content: { type: "empty" },
  };
}

/** Build Claude on left (50%), terminals stacked vertically on right (50%) */
export function buildTilingTree(
  claude: PaneNode,
  terminals: PaneNode[],
): PaneNode {
  if (terminals.length === 0) return claude;
  const right =
    terminals.length === 1
      ? terminals[0]
      : terminals.slice(1).reduce<PaneNode>(
          (acc, t) => ({
            id: `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            kind: "split" as const,
            orientation: "vertical" as const,
            children: [acc, t] as [PaneNode, PaneNode],
            sizes: [50, 50] as [number, number],
          }),
          terminals[0],
        );
  return {
    id: `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: "split",
    orientation: "horizontal",
    children: [claude, right],
    sizes: [50, 50],
  };
}
