import fs from "fs";
import { NextResponse } from "next/server";
import {
  getInstructionFile,
  updateInstructionFile,
  deleteInstructionFile,
} from "@/lib/db/instruction-files";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const file = getInstructionFile(id);
  if (!file) {
    return NextResponse.json(
      { error: "Instruction file not found" },
      { status: 404 },
    );
  }
  return NextResponse.json(file);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const existing = getInstructionFile(id);
  if (!existing) {
    return NextResponse.json(
      { error: "Instruction file not found" },
      { status: 404 },
    );
  }

  try {
    const body = await request.json();
    const updated = updateInstructionFile(id, body);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const file = getInstructionFile(id);
  if (!file) {
    return NextResponse.json(
      { error: "Instruction file not found" },
      { status: 404 },
    );
  }

  const deleted = deleteInstructionFile(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Failed to delete instruction file" },
      { status: 500 },
    );
  }

  try {
    if (fs.existsSync(file.filePath)) {
      fs.unlinkSync(file.filePath);
    }
  } catch {
    console.warn(`Failed to delete file from disk: ${file.filePath}`);
  }

  return NextResponse.json({ success: true });
}
