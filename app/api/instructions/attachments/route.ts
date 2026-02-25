import { NextResponse } from "next/server";
import {
  getAttachmentsForTarget,
  getAttachmentsForInstruction,
  attachInstruction,
  detachInstruction,
  toggleAttachment,
} from "@/lib/db/instruction-files";
import type { AttachmentTargetType } from "@/types/instructions";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetType = searchParams.get(
      "targetType",
    ) as AttachmentTargetType | null;
    const targetName = searchParams.get("targetName");
    const instructionId = searchParams.get("instructionId");

    if (instructionId) {
      const attachments = getAttachmentsForInstruction(instructionId);
      return NextResponse.json(attachments);
    }

    if (targetType && targetName) {
      const attachments = getAttachmentsForTarget(targetType, targetName);
      return NextResponse.json(attachments);
    }

    return NextResponse.json(
      { error: "Provide targetType+targetName or instructionId" },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch attachments" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "attach") {
      const { instructionId, targetType, targetName, priority } = body;
      if (!instructionId || !targetType || !targetName) {
        return NextResponse.json(
          { error: "instructionId, targetType, and targetName are required" },
          { status: 400 },
        );
      }
      attachInstruction({ instructionId, targetType, targetName, priority });
      return NextResponse.json({ success: true });
    }

    if (action === "detach") {
      const { instructionId, targetType, targetName } = body;
      if (!instructionId || !targetType || !targetName) {
        return NextResponse.json(
          { error: "instructionId, targetType, and targetName are required" },
          { status: 400 },
        );
      }
      const result = detachInstruction(instructionId, targetType, targetName);
      return NextResponse.json({ success: result });
    }

    if (action === "toggle") {
      const { instructionId, targetType, targetName, enabled } = body;
      if (
        !instructionId ||
        !targetType ||
        !targetName ||
        enabled === undefined
      ) {
        return NextResponse.json(
          {
            error:
              "instructionId, targetType, targetName, and enabled are required",
          },
          { status: 400 },
        );
      }
      toggleAttachment(instructionId, targetType, targetName, enabled);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Failed to process attachment request" },
      { status: 500 },
    );
  }
}
