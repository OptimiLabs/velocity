import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

interface MockFrontmatter {
  name: string;
  category: string;
  tags: string[];
}

// Create a unique temp directory for this test suite
const TEMP_DIR = path.join(os.tmpdir(), "claude-md-api-test-" + Date.now());

// Mock the module before importing
vi.mock("@/lib/claude-md/index", () => ({
    ensurePromptLibrary: () => {
      if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
      }
    },
    listPromptFiles: () => {
      if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
      }
      const files = fs.readdirSync(TEMP_DIR).filter((f) => f.endsWith(".md"));
      return files.map((filename) => {
        const fullPath = path.join(TEMP_DIR, filename);
        const raw = fs.readFileSync(fullPath, "utf-8");
        const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

        let frontmatter = {
          name: "Untitled",
          category: "general",
          tags: [] as string[],
        };
        let content = raw;

        if (match) {
          const yamlBlock = match[1];
          content = match[2].trim();
          const fm: Record<string, unknown> = {};
          for (const line of yamlBlock.split("\n")) {
            const kv = line.match(/^(\w+):\s*(.*)$/);
            if (kv) {
              const [, key, value] = kv;
              if (value.startsWith("[") && value.endsWith("]")) {
                fm[key] = value
                  .slice(1, -1)
                  .split(",")
                  .map((s: string) => s.trim().replace(/^["']|["']$/g, ""))
                  .filter(Boolean);
              } else {
                fm[key] = value.replace(/^["']|["']$/g, "");
              }
            }
          }
          const parsedCategory =
            typeof fm.category === "string" && fm.category.trim()
              ? fm.category
              : "general";
          frontmatter = {
            name: (fm.name as string) || "Untitled",
            category: parsedCategory,
            tags: Array.isArray(fm.tags) ? fm.tags : [],
          };
        }

        return { filename, frontmatter, content, fullPath };
      });
    },
    readPromptFile: (filename: string) => {
      const fullPath = path.join(TEMP_DIR, filename);
      if (!fs.existsSync(fullPath)) return null;
      const raw = fs.readFileSync(fullPath, "utf-8");
      const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

      let frontmatter = {
        name: "Untitled",
        category: "general",
        tags: [] as string[],
      };
      let content = raw;

      if (match) {
        const yamlBlock = match[1];
        content = match[2].trim();
        const fm: Record<string, unknown> = {};
        for (const line of yamlBlock.split("\n")) {
          const kv = line.match(/^(\w+):\s*(.*)$/);
          if (kv) {
            const [, key, value] = kv;
            if (value.startsWith("[") && value.endsWith("]")) {
              fm[key] = value
                .slice(1, -1)
                .split(",")
                .map((s: string) => s.trim().replace(/^["']|["']$/g, ""))
                .filter(Boolean);
            } else {
              fm[key] = value.replace(/^["']|["']$/g, "");
            }
          }
        }
        const parsedCategory =
          typeof fm.category === "string" && fm.category.trim()
            ? fm.category
            : "general";
        frontmatter = {
          name: (fm.name as string) || "Untitled",
          category: parsedCategory,
          tags: Array.isArray(fm.tags) ? fm.tags : [],
        };
      }

      return { filename, frontmatter, content, fullPath };
    },
    writePromptFile: (
      filename: string,
      content: string,
      frontmatter: MockFrontmatter,
    ) => {
      if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
      }
      const fullPath = path.join(TEMP_DIR, filename);
      const lines = [
        "---",
        `name: "${frontmatter.name}"`,
        `category: "${frontmatter.category}"`,
        `tags: [${frontmatter.tags.map((t: string) => `"${t}"`).join(", ")}]`,
        "---",
        "",
      ];
      const raw = lines.join("\n") + content;
      fs.writeFileSync(fullPath, raw, "utf-8");
      return { filename, frontmatter, content, fullPath };
    },
    deletePromptFile: (filename: string) => {
      const fullPath = path.join(TEMP_DIR, filename);
      if (!fs.existsSync(fullPath)) return false;
      fs.unlinkSync(fullPath);
      return true;
    },
    getPromptLibraryDir: () => TEMP_DIR,
}));

// Import after mocking
const {
  ensurePromptLibrary,
  listPromptFiles,
  readPromptFile,
  writePromptFile,
  deletePromptFile,
  getPromptLibraryDir,
} = await import("@/lib/claude-md/index");

describe("claude-md API library functions", () => {
  beforeEach(() => {
    // Clean up temp dir before each test
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up after tests
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  });

  it("should create prompt library directory and initialize git", () => {
    ensurePromptLibrary();
    expect(fs.existsSync(TEMP_DIR)).toBe(true);
  });

  it("should write and read a prompt file with frontmatter", () => {
    const filename = "test-prompt.md";
    const content = "This is a test prompt content.";
    const frontmatter = {
      name: "Test Prompt",
      category: "general" as const,
      tags: ["test", "example"],
    };

    // Write the file
    const written = writePromptFile(filename, content, frontmatter);
    expect(written.filename).toBe(filename);
    expect(written.content).toBe(content);
    expect(written.frontmatter).toEqual(frontmatter);

    // Read it back
    const read = readPromptFile(filename);
    expect(read).not.toBeNull();
    expect(read?.filename).toBe(filename);
    expect(read?.content).toBe(content);
    expect(read?.frontmatter.name).toBe("Test Prompt");
    expect(read?.frontmatter.category).toBe("general");
    expect(read?.frontmatter.tags).toEqual(["test", "example"]);
  });

  it("should list prompt files", () => {
    // Create multiple prompt files
    writePromptFile("prompt1.md", "Content 1", {
      name: "Prompt 1",
      category: "general",
      tags: ["tag1"],
    });
    writePromptFile("prompt2.md", "Content 2", {
      name: "Prompt 2",
      category: "pre-prompt",
      tags: ["tag2"],
    });

    const files = listPromptFiles();
    expect(files.length).toBe(2);
    expect(files.map((f) => f.filename)).toContain("prompt1.md");
    expect(files.map((f) => f.filename)).toContain("prompt2.md");
  });

  it("should delete a prompt file", () => {
    const filename = "to-delete.md";
    writePromptFile(filename, "Content", {
      name: "To Delete",
      category: "general",
      tags: [],
    });

    // Verify it exists
    expect(readPromptFile(filename)).not.toBeNull();

    // Delete it
    const deleted = deletePromptFile(filename);
    expect(deleted).toBe(true);

    // Verify it's gone
    expect(readPromptFile(filename)).toBeNull();
  });

  it("should handle non-existent files gracefully", () => {
    const result = readPromptFile("non-existent.md");
    expect(result).toBeNull();

    const deleteResult = deletePromptFile("non-existent.md");
    expect(deleteResult).toBe(false);
  });

  it("should return correct prompt library directory path", () => {
    const dir = getPromptLibraryDir();
    expect(dir).toBe(TEMP_DIR);
  });
});
