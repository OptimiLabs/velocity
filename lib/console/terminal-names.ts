const ADJECTIVES = [
  "swift",
  "calm",
  "bold",
  "bright",
  "warm",
  "keen",
  "quick",
  "quiet",
  "sharp",
  "brave",
  "fair",
  "glad",
  "kind",
  "neat",
  "wise",
  "cool",
  "deep",
  "fast",
  "free",
  "lean",
  "live",
  "pure",
  "rare",
  "safe",
  "soft",
  "true",
  "vast",
  "wild",
  "zest",
  "deft",
] as const;

const ANIMALS = [
  "fox",
  "otter",
  "crane",
  "wolf",
  "hawk",
  "lynx",
  "dove",
  "bear",
  "deer",
  "hare",
  "crow",
  "seal",
  "wren",
  "pike",
  "moth",
  "newt",
  "owl",
  "ram",
  "jay",
  "elk",
  "ant",
  "bee",
  "cod",
  "eel",
  "yak",
  "ape",
  "bat",
  "cat",
  "dog",
  "hen",
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a unique adjective-animal terminal name like "swift-fox".
 * Retries on collision up to 20 times, then appends a digit.
 */
export function generateTerminalName(existingNames: Set<string>): string {
  for (let i = 0; i < 20; i++) {
    const name = `${pick(ADJECTIVES)}-${pick(ANIMALS)}`;
    if (!existingNames.has(name)) return name;
  }
  // Fallback: append digit
  const base = `${pick(ADJECTIVES)}-${pick(ANIMALS)}`;
  let n = 2;
  while (existingNames.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
