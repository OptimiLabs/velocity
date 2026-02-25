import { describe, it, expect } from "vitest";
import { resolveActivePane } from "@/lib/console/resolve-active-pane";
import type { PaneNode } from "@/types/console";

function makeLeaf(
  id: string,
  type: "terminal" | "settings" | "context" | "empty",
  terminalId?: string,
): PaneNode & { kind: "leaf" } {
  const content =
    type === "terminal"
      ? ({ type: "terminal", terminalId: terminalId ?? id } as const)
      : ({ type } as const);
  return { id, kind: "leaf", content };
}

function makeSplit(children: [PaneNode, PaneNode]): PaneNode {
  return {
    id: `split-${Math.random().toString(36).slice(2, 6)}`,
    kind: "split",
    orientation: "horizontal",
    children,
  };
}

const defaults = {
  activePaneId: null,
  terminalLeaves: [] as Array<PaneNode & { kind: "leaf" }>,
  settingsLeafExists: false,
  contextLeafExists: false,
  activeSessionId: null,
};

describe("resolveActivePane", () => {
  it("returns empty-terminal when no activePaneId and no terminals", () => {
    const emptyLeaf = makeLeaf("empty-1", "empty");
    const result = resolveActivePane({
      ...defaults,
      paneTree: emptyLeaf,
    });
    expect(result.kind).toBe("empty-terminal");
    expect(result.activePaneId).toBeNull();
  });

  it("returns terminal (first leaf) when no activePaneId but terminals exist", () => {
    const t1 = makeLeaf("t1", "terminal", "term-1");
    const t2 = makeLeaf("t2", "terminal", "term-2");
    const tree = makeSplit([t1, t2]);
    const result = resolveActivePane({
      ...defaults,
      paneTree: tree,
      terminalLeaves: [t1, t2],
    });
    expect(result.kind).toBe("terminal");
    expect(result.activeTerminalPaneId).toBe("t1");
  });

  it("returns terminal when activePaneId points to terminal leaf", () => {
    const t1 = makeLeaf("t1", "terminal", "term-1");
    const t2 = makeLeaf("t2", "terminal", "term-2");
    const tree = makeSplit([t1, t2]);
    const result = resolveActivePane({
      ...defaults,
      paneTree: tree,
      activePaneId: "t1",
      terminalLeaves: [t1, t2],
    });
    expect(result.kind).toBe("terminal");
    expect(result.activeTerminalPaneId).toBe("t1");
  });

  it("returns empty-terminal when activePaneId is terminal leaf but not in terminalLeaves", () => {
    const t1 = makeLeaf("t1", "terminal", "term-1");
    const result = resolveActivePane({
      ...defaults,
      paneTree: t1,
      activePaneId: "t1",
      terminalLeaves: [], // no metadata
    });
    expect(result.kind).toBe("empty-terminal");
    expect(result.activeTerminalPaneId).toBeNull();
  });

  it("returns settings when activePaneId points to settings leaf", () => {
    const settingsLeaf = makeLeaf("settings-1", "settings");
    const t1 = makeLeaf("t1", "terminal", "term-1");
    const tree = makeSplit([t1, settingsLeaf]);
    const result = resolveActivePane({
      ...defaults,
      paneTree: tree,
      activePaneId: "settings-1",
      settingsLeafExists: true,
    });
    expect(result.kind).toBe("settings");
  });

  it("returns context when activePaneId points to context leaf", () => {
    const contextLeaf = makeLeaf("ctx-1", "context");
    const t1 = makeLeaf("t1", "terminal", "term-1");
    const tree = makeSplit([t1, contextLeaf]);
    const result = resolveActivePane({
      ...defaults,
      paneTree: tree,
      activePaneId: "ctx-1",
      contextLeafExists: true,
    });
    expect(result.kind).toBe("context");
  });

  it("falls back to terminal when activePaneId is non-existent and terminals exist", () => {
    const t1 = makeLeaf("t1", "terminal", "term-1");
    const result = resolveActivePane({
      ...defaults,
      paneTree: t1,
      activePaneId: "does-not-exist",
      terminalLeaves: [t1],
    });
    expect(result.kind).toBe("terminal");
    expect(result.activeTerminalPaneId).toBe("t1");
  });

  it("falls back to empty-terminal when activePaneId is non-existent and no terminals", () => {
    const emptyLeaf = makeLeaf("empty-1", "empty");
    const result = resolveActivePane({
      ...defaults,
      paneTree: emptyLeaf,
      activePaneId: "does-not-exist",
    });
    expect(result.kind).toBe("empty-terminal");
  });

  it("picks from filtered terminal list when only session-specific terminals are passed", () => {
    // Simulates the upstream ConsoleLayout filter: only session-B terminals are passed
    const tA = makeLeaf("tA", "terminal", "term-A");
    const tB1 = makeLeaf("tB1", "terminal", "term-B1");
    const tB2 = makeLeaf("tB2", "terminal", "term-B2");
    const tree = makeSplit([tA, makeSplit([tB1, tB2])]);

    const result = resolveActivePane({
      ...defaults,
      paneTree: tree,
      // Only session-B terminals passed (session-A filtered out upstream)
      terminalLeaves: [tB1, tB2],
      activeSessionId: "sess-B",
    });
    expect(result.kind).toBe("terminal");
    expect(result.activeTerminalPaneId).toBe("tB1");
  });

  it("redirects to first session terminal when active pane belongs to different session", () => {
    // activePaneId points to a terminal from session-A, but terminalLeaves
    // only contains session-B terminals (session-A was filtered upstream)
    const tA = makeLeaf("tA", "terminal", "term-A");
    const tB = makeLeaf("tB", "terminal", "term-B");
    const tree = makeSplit([tA, tB]);

    const result = resolveActivePane({
      ...defaults,
      paneTree: tree,
      activePaneId: "tA",
      terminalLeaves: [tB], // tA filtered out
      activeSessionId: "sess-B",
    });
    // tA exists in tree but not in session terminalLeaves → redirect to tB
    expect(result.kind).toBe("terminal");
    expect(result.activeTerminalPaneId).toBe("tB");
  });

  it("returns empty-terminal when activePaneId points to empty leaf", () => {
    const emptyLeaf = makeLeaf("empty-1", "empty");
    const result = resolveActivePane({
      ...defaults,
      paneTree: emptyLeaf,
      activePaneId: "empty-1",
    });
    expect(result.kind).toBe("empty-terminal");
    expect(result.activePaneId).toBe("empty-1");
    expect(result.activeTerminalPaneId).toBeNull();
  });
});
