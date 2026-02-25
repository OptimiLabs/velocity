import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// We test the frontmatter parsing and file ops by creating a temp dir
const TEST_DIR = path.join(os.tmpdir(), "claude-prompt-library-test");

describe("claude-md filesystem operations", () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("should parse frontmatter from markdown content", () => {
    const content = `---
name: "Test Prompt"
category: "general"
tags: ["coding", "review"]
---

This is the content of the prompt.`;

    const filePath = path.join(TEST_DIR, "test.md");
    fs.writeFileSync(filePath, content, "utf-8");

    const raw = fs.readFileSync(filePath, "utf-8");
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

    expect(match).not.toBeNull();
    expect(match![2].trim()).toBe("This is the content of the prompt.");
  });

  it("should handle missing frontmatter gracefully", () => {
    const content = "Just some raw content without frontmatter";

    const filePath = path.join(TEST_DIR, "raw.md");
    fs.writeFileSync(filePath, content, "utf-8");

    const raw = fs.readFileSync(filePath, "utf-8");
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

    expect(match).toBeNull();
  });

  it("should list .md files in a directory", () => {
    fs.writeFileSync(
      path.join(TEST_DIR, "a.md"),
      '---\nname: "A"\ncategory: "general"\ntags: []\n---\nContent A',
    );
    fs.writeFileSync(
      path.join(TEST_DIR, "b.md"),
      '---\nname: "B"\ncategory: "pre-prompt"\ntags: []\n---\nContent B',
    );
    fs.writeFileSync(path.join(TEST_DIR, "c.txt"), "Not a markdown file");

    const files = fs.readdirSync(TEST_DIR).filter((f) => f.endsWith(".md"));
    expect(files).toHaveLength(2);
    expect(files).toContain("a.md");
    expect(files).toContain("b.md");
  });

  it("should delete a file", () => {
    const filePath = path.join(TEST_DIR, "delete-me.md");
    fs.writeFileSync(filePath, "content");

    expect(fs.existsSync(filePath)).toBe(true);
    fs.unlinkSync(filePath);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("should serialize frontmatter correctly", () => {
    const fm = {
      name: "My Prompt",
      category: "claude-md",
      tags: ["test", "demo"],
    };

    const lines = [
      "---",
      `name: "${fm.name}"`,
      `category: "${fm.category}"`,
      `tags: [${fm.tags.map((t) => `"${t}"`).join(", ")}]`,
      "---",
      "",
    ];
    const serialized = lines.join("\n");

    expect(serialized).toContain('name: "My Prompt"');
    expect(serialized).toContain('category: "claude-md"');
    expect(serialized).toContain('tags: ["test", "demo"]');
  });
});
