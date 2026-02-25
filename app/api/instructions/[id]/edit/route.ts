import { NextResponse } from "next/server";
import {
  getInstructionFile,
  updateInstructionFile,
  recordEdit,
} from "@/lib/db/instruction-files";
import { editWithAI } from "@/lib/instructions/ai-editor";

export async function POST(
  request: Request,
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

  if (!file.isEditable) {
    return NextResponse.json({ error: "File is read-only" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { provider, prompt } = body;

    if (!provider || !prompt) {
      return NextResponse.json(
        { error: "Provider and prompt are required" },
        { status: 400 },
      );
    }

    const result = await editWithAI({
      provider,
      prompt,
      originalContent: file.content,
      instructionId: id,
    });

    // Save the edited content to DB and filesystem
    const updated = updateInstructionFile(id, { content: result.content });

    // Record edit history
    recordEdit({
      instructionId: id,
      editorType: result.editorType,
      promptUsed: prompt,
      contentBefore: file.content,
      contentAfter: result.content,
      tokensUsed: result.tokensUsed,
      cost: result.cost,
    });

    return NextResponse.json({
      file: updated,
      tokensUsed: result.tokensUsed,
      cost: result.cost,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI editing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
