import { describe, it, expect } from "vitest";
import {
  getRelevantHooks,
  getPrefilledMatcher,
  type RawHooks,
  type HookRule,
} from "@/lib/hooks/matcher";

describe("getRelevantHooks", () => {
  describe("PreToolUse direct matches", () => {
    it("classifies PreToolUse with matcher 'Skill' + entityType skill as direct", () => {
      const hooks: RawHooks = {
        PreToolUse: [
          {
            matcher: "Skill",
            hooks: [{ type: "command", command: "echo pre-skill" }],
          },
        ],
      };
      const result = getRelevantHooks("skill", hooks);
      expect(result.direct).toHaveLength(1);
      expect(result.direct[0].event).toBe("PreToolUse");
      expect(result.direct[0].relevance).toBe("direct");
    });

    it("classifies PostToolUse with matcher 'Task' + entityType agent as direct", () => {
      const hooks: RawHooks = {
        PostToolUse: [
          {
            matcher: "Task",
            hooks: [{ type: "command", command: "echo post-task" }],
          },
        ],
      };
      const result = getRelevantHooks("agent", hooks);
      expect(result.direct).toHaveLength(1);
      expect(result.direct[0].event).toBe("PostToolUse");
    });

    it("does not match PreToolUse with matcher 'Skill' for agent entityType", () => {
      const hooks: RawHooks = {
        PreToolUse: [
          {
            matcher: "Skill",
            hooks: [{ type: "command", command: "echo" }],
          },
        ],
      };
      const result = getRelevantHooks("agent", hooks);
      expect(result.direct).toHaveLength(0);
    });
  });

  describe("PreToolUse without matcher", () => {
    it("returns null relevance — not entity-specific", () => {
      const hooks: RawHooks = {
        PreToolUse: [
          {
            hooks: [{ type: "command", command: "echo all-tools" }],
          },
        ],
      };
      const result = getRelevantHooks("skill", hooks);
      expect(result.direct).toHaveLength(0);
      expect(result.lifecycle).toHaveLength(0);
      expect(result.global).toHaveLength(0);
    });
  });

  describe("lifecycle events", () => {
    it("classifies SubagentStart for agent as lifecycle", () => {
      const hooks: RawHooks = {
        SubagentStart: [
          {
            hooks: [{ type: "command", command: "echo start" }],
          },
        ],
      };
      const result = getRelevantHooks("agent", hooks);
      expect(result.lifecycle).toHaveLength(1);
      expect(result.lifecycle[0].relevance).toBe("lifecycle");
    });

    it("classifies SubagentStop for workflow as lifecycle", () => {
      const hooks: RawHooks = {
        SubagentStop: [
          {
            hooks: [{ type: "command", command: "echo stop" }],
          },
        ],
      };
      const result = getRelevantHooks("workflow", hooks);
      expect(result.lifecycle).toHaveLength(1);
    });

    it("classifies TaskCompleted for agent as lifecycle", () => {
      const hooks: RawHooks = {
        TaskCompleted: [
          {
            hooks: [{ type: "command", command: "echo done" }],
          },
        ],
      };
      const result = getRelevantHooks("agent", hooks);
      expect(result.lifecycle).toHaveLength(1);
    });

    it("returns null for lifecycle events + skill entityType (skills do not have lifecycle)", () => {
      const hooks: RawHooks = {
        SubagentStart: [
          {
            hooks: [{ type: "command", command: "echo" }],
          },
        ],
      };
      const result = getRelevantHooks("skill", hooks);
      expect(result.lifecycle).toHaveLength(0);
      expect(result.direct).toHaveLength(0);
      expect(result.global).toHaveLength(0);
    });
  });

  describe("session-level events are excluded", () => {
    it("SessionStart is always null for any entityType", () => {
      const hooks: RawHooks = {
        SessionStart: [
          {
            hooks: [{ type: "command", command: "echo session" }],
          },
        ],
      };
      expect(getRelevantHooks("skill", hooks).global).toHaveLength(0);
      expect(getRelevantHooks("agent", hooks).global).toHaveLength(0);
      expect(getRelevantHooks("workflow", hooks).global).toHaveLength(0);
    });

    it("SessionStop is always null", () => {
      const hooks: RawHooks = {
        SessionStop: [
          {
            hooks: [{ type: "command", command: "echo stop" }],
          },
        ],
      };
      const result = getRelevantHooks("agent", hooks);
      expect(result.direct).toHaveLength(0);
      expect(result.lifecycle).toHaveLength(0);
      expect(result.global).toHaveLength(0);
    });
  });

  describe("invalid matcher regex", () => {
    it("returns null when matcher has invalid regex", () => {
      const hooks: RawHooks = {
        PreToolUse: [
          {
            matcher: "[invalid(regex",
            hooks: [{ type: "command", command: "echo" }],
          },
        ],
      };
      const result = getRelevantHooks("skill", hooks);
      expect(result.direct).toHaveLength(0);
    });
  });

  describe("empty and malformed input", () => {
    it("returns empty groups for empty hooks object", () => {
      const result = getRelevantHooks("skill", {});
      expect(result.direct).toHaveLength(0);
      expect(result.lifecycle).toHaveLength(0);
      expect(result.global).toHaveLength(0);
    });

    it("skips rules without hooks array", () => {
      const hooks: RawHooks = {
        PreToolUse: [{ matcher: "Skill" } as HookRule],
      };
      const result = getRelevantHooks("skill", hooks);
      expect(result.direct).toHaveLength(0);
    });

    it("skips non-array rules", () => {
      const hooks = {
        PreToolUse: "not an array",
      } as unknown as RawHooks;
      const result = getRelevantHooks("skill", hooks);
      expect(result.direct).toHaveLength(0);
    });
  });

  describe("multiple hooks in a single rule", () => {
    it("creates one HookMatch per hook entry in the rule", () => {
      const hooks: RawHooks = {
        PreToolUse: [
          {
            matcher: "Skill",
            hooks: [
              { type: "command", command: "echo 1" },
              { type: "command", command: "echo 2" },
            ],
          },
        ],
      };
      const result = getRelevantHooks("skill", hooks);
      expect(result.direct).toHaveLength(2);
    });
  });

  describe("regex matcher with partial match", () => {
    it("matches Task via regex pattern", () => {
      const hooks: RawHooks = {
        PreToolUse: [
          {
            matcher: "Task|Skill",
            hooks: [{ type: "command", command: "echo" }],
          },
        ],
      };
      const result = getRelevantHooks("agent", hooks);
      expect(result.direct).toHaveLength(1);
    });
  });
});

describe("getPrefilledMatcher", () => {
  it("returns 'Skill' for skill entityType", () => {
    expect(getPrefilledMatcher("skill")).toBe("Skill");
  });

  it("returns 'Task' for agent entityType", () => {
    expect(getPrefilledMatcher("agent")).toBe("Task");
  });

  it("returns 'Task' for workflow entityType", () => {
    expect(getPrefilledMatcher("workflow")).toBe("Task");
  });
});
