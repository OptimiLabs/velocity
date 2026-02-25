import { describe, test, expect } from "vitest";
import {
  buildCommandPrompt,
  computeParallelGroups,
} from "@/lib/workflows/command-prompt";
import type { Workflow, WorkflowNode } from "@/types/workflow";

function makeNode(
  id: string,
  label: string,
  dependsOn: string[] = [],
  agentName: string | null = null,
  effort?: "low" | "medium" | "high",
): WorkflowNode {
  return {
    id,
    label,
    taskDescription: `Task for ${label}`,
    agentName,
    effort,
    status: "ready",
    position: { x: 0, y: 0 },
    dependsOn,
  };
}

function makeWorkflow(
  nodes: WorkflowNode[],
  overrides: Partial<Workflow> = {},
): Workflow {
  return {
    id: "wf-1",
    name: "Test Workflow",
    description: "",
    generatedPlan: "",
    nodes,
    edges: [],
    cwd: "",
    swarmId: null,
    commandName: null,
    commandDescription: null,
    activationContext: null,
    autoSkillEnabled: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("computeParallelGroups", () => {
  test("returns empty array when no parallel groups exist", () => {
    // Linear chain: A -> B -> C
    const nodes = [
      makeNode("a", "A"),
      makeNode("b", "B", ["a"]),
      makeNode("c", "C", ["b"]),
    ];
    const groups = computeParallelGroups(nodes);
    expect(groups).toEqual([]);
  });

  test("detects parallel group when multiple nodes share identical deps", () => {
    // A -> B, C, D (all depend only on A)
    const nodes = [
      makeNode("a", "Research"),
      makeNode("b", "Write tests", ["a"]),
      makeNode("c", "Write impl", ["a"]),
      makeNode("d", "Update docs", ["a"]),
    ];
    const groups = computeParallelGroups(nodes);
    expect(groups).toHaveLength(1);
    expect(groups[0].nodeIds).toEqual(expect.arrayContaining(["b", "c", "d"]));
    expect(groups[0].nodeIds).toHaveLength(3);
    expect(groups[0].sharedDepLabels).toEqual(["Research"]);
  });

  test("detects multiple parallel groups", () => {
    // Layer 0: A, B (roots, parallel)
    // Layer 1: C depends on A, D depends on B
    // Layer 2: E, F both depend on C and D (parallel)
    const nodes = [
      makeNode("a", "A"),
      makeNode("b", "B"),
      makeNode("c", "C", ["a"]),
      makeNode("d", "D", ["b"]),
      makeNode("e", "E", ["c", "d"]),
      makeNode("f", "F", ["c", "d"]),
    ];
    const groups = computeParallelGroups(nodes);
    // Roots A,B are parallel; E,F are parallel
    expect(groups).toHaveLength(2);

    const rootGroup = groups.find((g) => g.nodeIds.includes("a"));
    expect(rootGroup).toBeDefined();
    expect(rootGroup!.nodeIds).toEqual(expect.arrayContaining(["a", "b"]));
    expect(rootGroup!.sharedDepLabels).toEqual([]);

    const lastGroup = groups.find((g) => g.nodeIds.includes("e"));
    expect(lastGroup).toBeDefined();
    expect(lastGroup!.nodeIds).toEqual(expect.arrayContaining(["e", "f"]));
    expect(lastGroup!.sharedDepLabels).toEqual(
      expect.arrayContaining(["C", "D"]),
    );
  });

  test("does not group nodes with different deps in the same layer", () => {
    // A, B are roots
    // C depends on A; D depends on B — same layer but different deps
    const nodes = [
      makeNode("a", "A"),
      makeNode("b", "B"),
      makeNode("c", "C", ["a"]),
      makeNode("d", "D", ["b"]),
    ];
    const groups = computeParallelGroups(nodes);
    // Only roots form a parallel group
    const rootGroup = groups.find((g) => g.nodeIds.includes("a"));
    expect(rootGroup).toBeDefined();
    // C and D should NOT be in a group together since they have different deps
    const cdGroup = groups.find(
      (g) => g.nodeIds.includes("c") && g.nodeIds.includes("d"),
    );
    expect(cdGroup).toBeUndefined();
  });

  test("single node layers are not parallel groups", () => {
    const nodes = [makeNode("a", "Solo")];
    const groups = computeParallelGroups(nodes);
    expect(groups).toEqual([]);
  });

  test("treats missing dependsOn as empty deps", () => {
    const malformed = {
      ...makeNode("a", "A"),
      dependsOn: undefined,
    } as unknown as WorkflowNode;
    const nodes = [malformed, makeNode("b", "B")];
    const groups = computeParallelGroups(nodes);
    expect(groups).toHaveLength(1);
    expect(groups[0].nodeIds).toEqual(expect.arrayContaining(["a", "b"]));
  });
});

describe("buildCommandPrompt", () => {
  test("includes parallel group callout for parallel steps", () => {
    const nodes = [
      makeNode("a", "Research", [], "explorer"),
      makeNode("b", "Write tests", ["a"], "test-writer"),
      makeNode("c", "Write impl", ["a"], "implementer"),
      makeNode("d", "Update docs", ["a"], "docs-writer"),
      makeNode("e", "Review", ["b", "c", "d"]),
    ];
    const wf = makeWorkflow(nodes, { name: "Feature Build" });
    const prompt = buildCommandPrompt(wf);

    // Should contain parallel callout for steps 2, 3, 4
    expect(prompt).toMatch(/parallel/i);
    expect(prompt).toMatch(/Task tool/);
    // Should still contain all step labels
    expect(prompt).toContain("Research");
    expect(prompt).toContain("Write tests");
    expect(prompt).toContain("Write impl");
    expect(prompt).toContain("Update docs");
    expect(prompt).toContain("Review");
  });

  test("does not include parallel callout for purely sequential workflows", () => {
    const nodes = [
      makeNode("a", "Step 1"),
      makeNode("b", "Step 2", ["a"]),
      makeNode("c", "Step 3", ["b"]),
    ];
    const wf = makeWorkflow(nodes);
    const prompt = buildCommandPrompt(wf);

    expect(prompt).not.toMatch(/single message/i);
    expect(prompt).not.toMatch(/parallel/i);
    // Should still include general Task tool execution instructions
    expect(prompt).toMatch(/Task tool/);
  });

  test("parallel instruction section tells Claude to use parallel Task tool calls", () => {
    const nodes = [
      makeNode("a", "Setup"),
      makeNode("b", "Task A", ["a"]),
      makeNode("c", "Task B", ["a"]),
    ];
    const wf = makeWorkflow(nodes);
    const prompt = buildCommandPrompt(wf);

    expect(prompt).toMatch(/single message/i);
    expect(prompt).toMatch(/parallel/i);
  });

  test("does not throw when node dependsOn is missing", () => {
    const malformed = {
      ...makeNode("a", "A"),
      dependsOn: undefined,
    } as unknown as WorkflowNode;
    const wf = makeWorkflow([malformed, makeNode("b", "B", ["a"])]);
    expect(() => buildCommandPrompt(wf)).not.toThrow();
    const prompt = buildCommandPrompt(wf);
    expect(prompt).toContain("A");
    expect(prompt).toContain("B");
  });

  test("includes effort metadata from node and scoped agents", () => {
    const nodes = [
      makeNode("a", "Plan", [], "planner", "high"),
      makeNode("b", "Review", ["a"], "reviewer"),
    ];
    const wf = makeWorkflow(nodes, {
      scopedAgents: [
        {
          id: "sa-1",
          workflowId: "wf-1",
          name: "reviewer",
          description: "reviews changes",
          effort: "medium",
          tools: [],
          disallowedTools: [],
          prompt: "review",
          skills: [],
          createdAt: "",
          updatedAt: "",
        },
      ],
    });
    const prompt = buildCommandPrompt(wf);

    expect(prompt).toContain("[effort: high]");
    expect(prompt).toContain("[effort: medium]");
    expect(prompt).toMatch(
      /If a step includes \[model: \.\.\.\] or \[effort: \.\.\.\]/,
    );
  });
});
