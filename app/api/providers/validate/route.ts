import { NextResponse } from "next/server";
import type { ProviderSlug } from "@/types/instructions";

interface ValidateBody {
  providerSlug: ProviderSlug;
  apiKey: string;
  endpointUrl?: string;
}

const TIMEOUT_MS = 10_000;

async function testConnection(
  url: string,
  init: RequestInit,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return { valid: true };
    const body = await res.text().catch(() => "");
    return {
      valid: false,
      error: `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    return { valid: false, error: msg };
  }
}

export async function POST(request: Request) {
  try {
    const { providerSlug, apiKey, endpointUrl } =
      (await request.json()) as ValidateBody;

    if (!providerSlug) {
      return NextResponse.json(
        { error: "providerSlug is required" },
        { status: 400 },
      );
    }

    let result: { valid: boolean; error?: string };

    switch (providerSlug) {
      case "anthropic":
        result = await testConnection("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
        });
        break;

      case "openai":
        result = await testConnection("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        break;

      case "google":
        result = await testConnection(
          `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`,
          {},
        );
        break;

      case "openrouter":
        result = await testConnection("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        break;

      case "local": {
        const base = (endpointUrl || "http://localhost:11434/v1").replace(
          /\/$/,
          "",
        );
        result = await testConnection(`${base}/models`, {});
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown provider: ${providerSlug}` },
          { status: 400 },
        );
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { valid: false, error: "Validation request failed" },
      { status: 500 },
    );
  }
}
