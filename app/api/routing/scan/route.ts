import { scanRoutingGraph, type RoutingScanProvider } from "@/lib/routing/scanner";
import type { ScanProgressEvent } from "@/types/routing-graph";
import { apiLog } from "@/lib/logger";

const VALID_PROVIDERS = new Set<RoutingScanProvider>(["all", "claude", "codex", "gemini"]);

export async function POST(req: Request) {
  const url = new URL(req.url);
  const providerParam = url.searchParams.get("provider");
  const provider = providerParam && VALID_PROVIDERS.has(providerParam as RoutingScanProvider)
    ? (providerParam as RoutingScanProvider)
    : "all";

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: ScanProgressEvent) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      }

      try {
        await scanRoutingGraph(sendEvent, provider);
      } catch (err) {
        apiLog.error("knowledge scan failed", err);
        sendEvent({
          type: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
