/**
 * Extract the first balanced JSON object from a string.
 * Unlike the greedy regex /\{[\s\S]*\}/, this correctly handles
 * nested braces, string escapes, and surrounding commentary.
 */
export function extractFirstJsonObject(text: string): string | null {
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    const candidate = extractBalancedJsonObject(text, start);
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return candidate;
      }
    } catch {
      // Try the next opening brace; models sometimes emit "{example}" text
      // before the actual JSON payload.
    }
  }
  return null;
}

function extractBalancedJsonObject(text: string, start: number): string | null {
  if (text[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
