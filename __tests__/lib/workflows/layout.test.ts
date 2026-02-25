import { describe, expect, it } from "vitest";
import {
  pruneDisconnectedNodes,
  buildEdgesFromDeps,
} from "@/lib/workflows/layout";
import type { WorkflowNode } from "@/types/workflow";

function makeNode(
  id: string,
  dependsOn: string[] = [],
): WorkflowNode {
  return {
    id,
    label: id,
    taskDescription: "",
    agentName: id,
    status: "unconfirmed",
    position: { x: 0, y: 0 },
    dependsOn,
  };
}

describe("pruneDisconnectedNodes", () => {
  it("keeps all nodes when fully connected", () => {
    const nodes = [
      makeNode("step-1"),
      makeNode("step-2", ["step-1"]),
      makeNode("step-3", ["step-2"]),
    ];
    const edges = buildEdgesFromDeps(nodes);
    const result = pruneDisconnectedNodes(nodes, edges);
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
  });

  it("removes orphan nodes with no connections", () => {
    const nodes = [
      makeNode("step-1"),
      makeNode("step-2", ["step-1"]),
      makeNode("step-3", ["step-1"]),
      makeNode("orphan"), // no deps, nothing depends on it
    ];
    const edges = buildEdgesFromDeps(nodes);
    const result = pruneDisconnectedNodes(nodes, edges);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.map((n) => n.id)).toEqual([
      "step-1",
      "step-2",
      "step-3",
    ]);
  });

  it("keeps the largest connected component when multiple exist", () => {
    const nodes = [
      makeNode("a"),
      makeNode("b", ["a"]),
      makeNode("c", ["b"]),
      makeNode("d", ["c"]),
      // smaller disconnected component
      makeNode("x"),
      makeNode("y", ["x"]),
    ];
    const edges = buildEdgesFromDeps(nodes);
    const result = pruneDisconnectedNodes(nodes, edges);
    expect(result.nodes).toHaveLength(4);
    expect(result.nodes.map((n) => n.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("returns single-node graphs unchanged", () => {
    const nodes = [makeNode("only")];
    const result = pruneDisconnectedNodes(nodes, []);
    expect(result.nodes).toHaveLength(1);
  });

  it("returns empty graphs unchanged", () => {
    const result = pruneDisconnectedNodes([], []);
    expect(result.nodes).toHaveLength(0);
  });

  it("removes multiple orphans", () => {
    const nodes = [
      makeNode("step-1"),
      makeNode("step-2", ["step-1"]),
      makeNode("orphan-a"),
      makeNode("orphan-b"),
    ];
    const edges = buildEdgesFromDeps(nodes);
    const result = pruneDisconnectedNodes(nodes, edges);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.map((n) => n.id)).toEqual(["step-1", "step-2"]);
  });

  it("also prunes edges belonging to removed nodes", () => {
    const nodes = [
      makeNode("a"),
      makeNode("b", ["a"]),
      makeNode("x"),
      makeNode("y", ["x"]),
    ];
    const edges = buildEdgesFromDeps(nodes);
    // Both components are size 2 — largest wins (first encountered)
    const result = pruneDisconnectedNodes(nodes, edges);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    // All edges should reference only surviving nodes
    const nodeIds = new Set(result.nodes.map((n) => n.id));
    for (const e of result.edges) {
      expect(nodeIds.has(e.source)).toBe(true);
      expect(nodeIds.has(e.target)).toBe(true);
    }
  });
});
