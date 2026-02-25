import { describe, expect, it } from "vitest";
import {
  addRouterEntry,
  removeRouterEntry,
  updateRouterEntry,
} from "@/lib/instructions/router-writer";

describe("router-writer skill path matching", () => {
  it("adds a shorter skill path even when a longer prefixed path exists", () => {
    const input = `## Skills

| When... | Use |
| ------- | --- |
| QA smoke deploy | \`/qa-smoke-command\` |
`;

    const output = addRouterEntry(input, {
      trigger: "Quick QA",
      path: "qa",
      category: "skills",
      type: "skill",
    });

    expect(output).toContain("| QA smoke deploy | `/qa-smoke-command` |");
    expect(output).toContain("| Quick QA | `/qa` |");
  });

  it("does not duplicate an existing exact skill path", () => {
    const input = `## Skills

| When... | Use |
| ------- | --- |
| Quick QA | \`/qa\` |
`;

    const output = addRouterEntry(input, {
      trigger: "Another QA Trigger",
      path: "qa",
      category: "skills",
      type: "skill",
    });

    const qaRows = output.match(/`\/qa`/g) ?? [];
    expect(qaRows).toHaveLength(1);
    expect(output).toContain("| Quick QA | `/qa` |");
  });

  it("removes only the exact matching skill path", () => {
    const input = `## Skills

| When... | Use |
| ------- | --- |
| Quick QA | \`/qa\` |
| QA smoke deploy | \`/qa-smoke-command\` |
`;

    const output = removeRouterEntry(input, "qa");

    expect(output).not.toContain("| Quick QA | `/qa` |");
    expect(output).toContain("| QA smoke deploy | `/qa-smoke-command` |");
  });

  it("updates only the exact matching skill path", () => {
    const input = `## Skills

| When... | Use |
| ------- | --- |
| Quick QA | \`/qa\` |
| QA smoke deploy | \`/qa-smoke-command\` |
`;

    const output = updateRouterEntry(input, "qa", "Quick QA (updated)");

    expect(output).toContain("| Quick QA (updated) | `/qa` |");
    expect(output).toContain("| QA smoke deploy | `/qa-smoke-command` |");
  });
});
