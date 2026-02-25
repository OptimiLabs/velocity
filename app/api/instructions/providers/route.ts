import { NextResponse } from "next/server";
import {
  listAIProviders,
  saveAIProviderKey,
  deleteAIProviderKey,
  updateProviderConfig,
} from "@/lib/db/instruction-files";

export async function GET() {
  try {
    const providers = listAIProviders();
    return NextResponse.json(providers);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch providers" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      provider,
      providerSlug,
      displayName,
      apiKey,
      modelId,
      endpointUrl,
      temperature,
      topK,
      topP,
      thinkingBudget,
      maxTokens,
    } = body;

    if (!provider || !displayName || !apiKey) {
      return NextResponse.json(
        { error: "provider, displayName, and apiKey are required" },
        { status: 400 },
      );
    }

    saveAIProviderKey({
      provider,
      providerSlug,
      displayName,
      apiKey,
      modelId,
      endpointUrl,
      temperature,
      topK,
      topP,
      thinkingBudget,
      maxTokens,
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to save provider" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { providerSlug, ...config } = body;

    if (!providerSlug) {
      return NextResponse.json(
        { error: "providerSlug is required" },
        { status: 400 },
      );
    }

    const updated = updateProviderConfig(providerSlug, config);
    if (!updated) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to update provider config" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");

    if (!provider) {
      return NextResponse.json(
        { error: "Provider is required" },
        { status: 400 },
      );
    }

    const deleted = deleteAIProviderKey(provider);
    if (!deleted) {
      return NextResponse.json(
        { error: "Provider not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete provider" },
      { status: 500 },
    );
  }
}
