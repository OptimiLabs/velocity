"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SkillData {
  name: string;
  description?: string;
  content: string;
}

const SKILL_TEMPLATES = [
  {
    name: "code-review",
    description:
      'Reviews code changes for quality, security, and correctness. Use when user says "review this", "check my code", "code review", or submits a PR for feedback.',
    content:
      '# Code Review\n\n## Instructions\n\n### Step 1: Understand the change\nRead the diff or code provided. Identify the purpose of the change.\n\n### Step 2: Analyze for issues\nReview for:\n- Bug risks and logic errors\n- Performance issues\n- Security concerns (injection, auth, data exposure)\n- Code style violations\n\n### Step 3: Provide feedback\nGive specific, actionable feedback with line references. Suggest fixes, not just problems.\n\n## Examples\n\nExample 1: PR review\nUser says: "Review this PR"\nActions:\n1. Read the full diff\n2. Check each file for the issues above\n3. Provide a summary with severity levels\n\n## Troubleshooting\n\nError: "No changes found"\nCause: No staged changes or diff is empty\nSolution: Ensure code is staged or provide a file path',
  },
  {
    name: "commit-message",
    description:
      'Generates conventional commit messages from staged changes. Use when user says "commit", "write a commit message", or "what should I commit as".',
    content:
      "# Commit Message Generator\n\n## Instructions\n\n### Step 1: Analyze staged changes\nRun `git diff --staged` to see what will be committed.\n\n### Step 2: Categorize the change\nDetermine the type: feat, fix, refactor, docs, test, chore.\nIdentify the scope (module or area affected).\n\n### Step 3: Write the message\nFollow the format:\n```\ntype(scope): description\n\nOptional body explaining why, not what.\n```\n- Keep the first line under 72 characters\n- Add body if changes are complex\n\n## Examples\n\nExample 1: Simple bug fix\nUser says: \"Write a commit message\"\nResult: `fix(auth): prevent session timeout on idle tabs`\n\nExample 2: New feature\nResult: `feat(dashboard): add real-time usage chart with WebSocket updates`",
  },
  {
    name: "test-writer",
    description:
      'Generates comprehensive tests for code using the project\'s testing framework. Use when user says "write tests", "add tests for", "test this", or "increase coverage".',
    content:
      "# Test Writer\n\n## Instructions\n\n### Step 1: Identify the testing framework\nCheck the project for existing test files and config (vitest, jest, pytest, etc.).\n\n### Step 2: Analyze the code under test\nRead the function/module to understand inputs, outputs, and edge cases.\n\n### Step 3: Write tests\nInclude:\n- Happy path tests (expected behavior)\n- Edge cases (empty inputs, boundaries, nulls)\n- Error handling (invalid inputs, network failures)\n- Boundary conditions (max values, overflow)\n\nUse the testing framework already present in the project.\n\n## Examples\n\nExample 1: Unit test for a utility function\nUser says: \"Write tests for utils/format.ts\"\nActions:\n1. Read the file to understand exports\n2. Generate test cases for each exported function\n3. Include edge cases specific to the function's domain\n\n## Troubleshooting\n\nError: \"Cannot find test runner\"\nCause: No test framework configured\nSolution: Check package.json for test scripts and install if needed",
  },
];

interface InlineSkillEditorProps {
  skill?: SkillData;
  isNew: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function InlineSkillEditor({
  skill,
  isNew,
  onSave,
  onCancel,
}: InlineSkillEditorProps) {
  const [name, setName] = useState(skill?.name || "");
  const [description, setDescription] = useState(skill?.description || "");
  const [content, setContent] = useState(skill?.content || "");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load full skill content when editing (the skill prop may not have content)
  useEffect(() => {
    if (!isNew && skill?.name && !skill.content) {
      setLoading(true);
      fetch(`/api/skills/${encodeURIComponent(skill.name)}`)
        .then((r) => r.json())
        .then((data) => {
          setName(data.name || skill.name);
          setDescription(data.description || "");
          setContent(data.content || "");
        })
        .catch(() => setError("Failed to load skill"))
        .finally(() => setLoading(false));
    }
  }, [isNew, skill?.name, skill?.content]);

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      const url = isNew
        ? "/api/skills"
        : `/api/skills/${encodeURIComponent(skill!.name)}`;
      const method = isNew ? "POST" : "PUT";
      const body: Record<string, string> = { content };
      if (isNew) body.name = name.trim();
      if (description.trim()) body.description = description.trim();

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        setSaving(false);
        return;
      }

      onSave();
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  };

  return (
    <Card className="bg-muted/30 border-chart-5/20">
      <CardContent className="p-4 space-y-4">
        {loading ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            Loading...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-skill"
                  className="h-8 text-xs font-mono mt-1"
                  disabled={!isNew}
                />
                {isNew && (
                  <p className="text-meta text-text-tertiary mt-1">
                    Slash command: /{name || "skill-name"}
                  </p>
                )}
              </div>
              <div>
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Description
                </label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder='e.g. Analyzes PR diffs for security issues. Use when user says "review PR".'
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>

            {isNew && (
              <div>
                <label className="text-meta uppercase tracking-wider text-muted-foreground">
                  Template
                </label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {SKILL_TEMPLATES.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => {
                        setName(t.name);
                        setDescription(t.description);
                        setContent(t.content);
                      }}
                      className="px-2.5 py-1 text-meta rounded-md border border-border/50 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30 transition-colors"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-meta uppercase tracking-wider text-muted-foreground">
                Content
              </label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={"# Skill Name\n\n## Instructions\n\n### Step 1: [First step]\nClear explanation of what happens.\n\n### Step 2: [Next step]\nExpected output: [describe success]\n\n## Examples\n\nExample 1: [Common scenario]\nUser says: \"...\"\nResult: ...\n\n## Troubleshooting\n\nError: [Common error]\nSolution: [How to fix]"}
                className="min-h-[200px] resize-y text-xs font-mono mt-1"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={(isNew && !name.trim()) || !content.trim() || saving}
              >
                {saving ? "Saving..." : isNew ? "Create" : "Update"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
