import { describe, expect, it } from "vitest";
import { extractFirstJsonObject } from "@/lib/ai/parse";

describe("extractFirstJsonObject", () => {
  it("extracts a plain JSON object", () => {
    expect(extractFirstJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it("skips non-JSON brace blocks before the real payload", () => {
    const input = 'Example: {not valid json}\n\nActual: {"name":"agent","tools":["Read"]}';
    expect(extractFirstJsonObject(input)).toBe('{"name":"agent","tools":["Read"]}');
  });

  it("handles nested braces and braces inside strings", () => {
    const input =
      'prefix {"prompt":"Use {braces} literally","meta":{"depth":2,"ok":true}} suffix';
    expect(extractFirstJsonObject(input)).toBe(
      '{"prompt":"Use {braces} literally","meta":{"depth":2,"ok":true}}',
    );
  });

  it("returns null when no object exists", () => {
    expect(extractFirstJsonObject("no json here")).toBeNull();
  });
});
