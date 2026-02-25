import { NextResponse } from "next/server";
import {
  getAIProviderKey,
  saveAIProviderKey,
  deleteAIProviderKey,
} from "@/lib/db/instruction-files";
import type { AIProviderType, ProviderSlug } from "@/types/instructions";
import { getAIProvider } from "@/lib/providers/ai-registry";
import { getProviderBySlug } from "@/lib/providers/catalog";

function getProvider(request: Request): AIProviderType {
  const { searchParams } = new URL(request.url);
  return (searchParams.get("provider") || "anthropic") as AIProviderType;
}

export async function GET(request: Request) {
  try {
    const provider = getProvider(request);
    const dbKey = getAIProviderKey(provider);
    if (dbKey) {
      return NextResponse.json({ hasKey: true, source: "db" as const });
    }

    const adapter = getAIProvider(provider);
    const envVar = adapter?.envVarKey;
    if (envVar && process.env[envVar]) {
      return NextResponse.json({ hasKey: true, source: "env" as const });
    }

    return NextResponse.json({ hasKey: false, source: null });
  } catch {
    return NextResponse.json(
      { error: "Failed to check API key" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const provider = getProvider(request);
    const { apiKey } = await request.json();
    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 },
      );
    }

    const catalog = getProviderBySlug(provider as ProviderSlug);
    const displayName = catalog?.name ?? provider;

    saveAIProviderKey({
      provider,
      displayName,
      apiKey,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to save API key" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const provider = getProvider(request);
    deleteAIProviderKey(provider);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete API key" },
      { status: 500 },
    );
  }
}
