import { NextResponse } from "next/server";
import {
  readPromptFile,
  writePromptFile,
  deletePromptFile,
  commitChanges,
} from "@/lib/claude-md";
import type { PromptFileFrontmatter } from "@/lib/claude-md";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const filename = decodeURIComponent(id);
  const file = readPromptFile(filename);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(file);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const filename = decodeURIComponent(id);
  const body = await request.json();
  const { content, frontmatter } = body as {
    content: string;
    frontmatter: PromptFileFrontmatter;
  };

  const file = writePromptFile(filename, content, frontmatter);
  commitChanges(`Update prompt: ${frontmatter.name}`);
  return NextResponse.json(file);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const filename = decodeURIComponent(id);
  const deleted = deletePromptFile(filename);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  commitChanges(`Delete prompt: ${filename}`);
  return NextResponse.json({ ok: true });
}
