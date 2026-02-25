import { describe, test, expect } from "vitest";
import { countPluginComponents } from "@/lib/marketplace/component-counts";

// Simulates the GitHub tree API response shape
type TreeItem = { path: string; type: "blob" | "tree" };

function makeTree(paths: string[]): TreeItem[] {
  return paths.map((p) => ({ path: p, type: "blob" as const }));
}

describe("countPluginComponents", () => {
  describe("Strategy 1: manifest paths", () => {
    test("counts skills from manifest skill arrays", () => {
      const tree = makeTree([
        "skills/xlsx/SKILL.md",
        "skills/pdf/SKILL.md",
        "skills/csv/SKILL.md",
        "README.md",
      ]);
      const plugins = [
        {
          name: "document-skills",
          skills: ["./skills/xlsx", "./skills/pdf"],
        },
        {
          name: "example-skills",
          skills: ["./skills/csv"],
        },
      ];

      const counts = countPluginComponents(tree, plugins);

      expect(counts["document-skills"]).toEqual({
        agents: 0,
        skills: 2,
        commands: 0,
      });
      expect(counts["example-skills"]).toEqual({
        agents: 0,
        skills: 1,
        commands: 0,
      });
    });

    test("counts agents and commands from manifest arrays", () => {
      const tree = makeTree([
        "agents/reviewer/SKILL.md",
        "commands/deploy/SKILL.md",
        "commands/test/SKILL.md",
      ]);
      const plugins = [
        {
          name: "dev-tools",
          agents: ["./agents/reviewer"],
          commands: ["./commands/deploy", "./commands/test"],
        },
      ];

      const counts = countPluginComponents(tree, plugins);

      expect(counts["dev-tools"]).toEqual({
        agents: 1,
        skills: 0,
        commands: 2,
      });
    });

    test("validates manifest paths against tree - missing files not counted", () => {
      const tree = makeTree(["skills/xlsx/SKILL.md"]);
      const plugins = [
        {
          name: "doc-skills",
          skills: ["./skills/xlsx", "./skills/nonexistent"],
        },
      ];

      const counts = countPluginComponents(tree, plugins);

      expect(counts["doc-skills"]).toEqual({
        agents: 0,
        skills: 1,
        commands: 0,
      });
    });

    test("handles paths without ./ prefix", () => {
      const tree = makeTree(["skills/xlsx/SKILL.md"]);
      const plugins = [
        {
          name: "doc-skills",
          skills: ["skills/xlsx"],
        },
      ];

      const counts = countPluginComponents(tree, plugins);

      expect(counts["doc-skills"]).toEqual({
        agents: 0,
        skills: 1,
        commands: 0,
      });
    });

    test("matches README.md as fallback when SKILL.md missing", () => {
      const tree = makeTree(["skills/xlsx/README.md"]);
      const plugins = [
        {
          name: "doc-skills",
          skills: ["./skills/xlsx"],
        },
      ];

      const counts = countPluginComponents(tree, plugins);

      expect(counts["doc-skills"]).toEqual({
        agents: 0,
        skills: 1,
        commands: 0,
      });
    });
  });

  describe("Strategy 2: plugins/ subdirectory scan", () => {
    test("counts components in plugins/<name>/{agents,skills,commands}/*.md", () => {
      const tree = makeTree([
        "plugins/my-plugin/skills/foo.md",
        "plugins/my-plugin/skills/bar.md",
        "plugins/my-plugin/agents/helper.md",
        "plugins/my-plugin/commands/run.md",
      ]);
      // Plugin with no manifest paths — falls through to Strategy 2
      const plugins = [{ name: "my-plugin" }];

      const counts = countPluginComponents(tree, plugins);

      expect(counts["my-plugin"]).toEqual({
        agents: 1,
        skills: 2,
        commands: 1,
      });
    });
  });

  describe("Strategy 3: root-level directory fallback", () => {
    test("scans source-relative dirs when plugin has source field", () => {
      const tree = makeTree([
        "packages/toolkit/agents/helper.md",
        "packages/toolkit/skills/foo.md",
        "packages/toolkit/skills/bar.md",
      ]);
      const plugins = [{ name: "toolkit", source: "packages/toolkit" }];

      const counts = countPluginComponents(tree, plugins);

      expect(counts["toolkit"]).toEqual({
        agents: 1,
        skills: 2,
        commands: 0,
      });
    });

    test("scans root-level dirs as last resort", () => {
      const tree = makeTree([
        "skills/foo/SKILL.md",
        "skills/bar/SKILL.md",
        "agents/helper/SKILL.md",
      ]);
      // No manifest paths, no plugins/ dir, no source field
      const plugins = [{ name: "my-stuff" }];

      const counts = countPluginComponents(tree, plugins);

      expect(counts["my-stuff"]).toEqual({
        agents: 1,
        skills: 2,
        commands: 0,
      });
    });
  });

  describe("strategy priority", () => {
    test("manifest paths take priority over plugins/ scan", () => {
      const tree = makeTree([
        "skills/xlsx/SKILL.md",
        "plugins/doc-skills/skills/old.md",
        "plugins/doc-skills/skills/legacy.md",
      ]);
      const plugins = [
        {
          name: "doc-skills",
          skills: ["./skills/xlsx"],
        },
      ];

      const counts = countPluginComponents(tree, plugins);

      // Strategy 1 found 1 skill via manifest → uses that, doesn't fall through
      expect(counts["doc-skills"]).toEqual({
        agents: 0,
        skills: 1,
        commands: 0,
      });
    });
  });

  describe("no plugins array", () => {
    test("works with no plugins argument (backward compat)", () => {
      const tree = makeTree([
        "plugins/foo/skills/bar.md",
        "plugins/foo/agents/baz.md",
      ]);

      const counts = countPluginComponents(tree);

      expect(counts["foo"]).toEqual({
        agents: 1,
        skills: 1,
        commands: 0,
      });
    });
  });
});
