import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanProgressEvent } from "@/types/routing-graph";

const scanRoutingGraphMock = vi.fn<
  (send?: (event: ScanProgressEvent) => void, provider?: "all" | "claude" | "codex" | "gemini") => Promise<unknown>
>();

vi.mock("@/lib/routing/scanner", () => ({
  scanRoutingGraph: scanRoutingGraphMock,
}));

describe("POST /api/routing/scan", () => {
  beforeEach(() => {
    scanRoutingGraphMock.mockReset();
    scanRoutingGraphMock.mockImplementation(async (send) => {
      send?.({
        type: "progress",
        phase: "discovering",
        current: 1,
        total: 1,
      });
    });
  });

  it("passes through a valid provider query param", async () => {
    const { POST } = await import("@/app/api/routing/scan/route");
    const req = new Request("http://localhost/api/routing/scan?provider=codex", {
      method: "POST",
    });

    const res = await POST(req);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    await res.text();

    expect(scanRoutingGraphMock).toHaveBeenCalledTimes(1);
    expect(scanRoutingGraphMock.mock.calls[0]?.[1]).toBe("codex");
  });

  it("defaults to provider=all when omitted or invalid", async () => {
    const { POST } = await import("@/app/api/routing/scan/route");

    const noProviderReq = new Request("http://localhost/api/routing/scan", {
      method: "POST",
    });
    const invalidProviderReq = new Request(
      "http://localhost/api/routing/scan?provider=nope",
      { method: "POST" },
    );

    const res1 = await POST(noProviderReq);
    await res1.text();
    const res2 = await POST(invalidProviderReq);
    await res2.text();

    expect(scanRoutingGraphMock.mock.calls[0]?.[1]).toBe("all");
    expect(scanRoutingGraphMock.mock.calls[1]?.[1]).toBe("all");
  });
});
