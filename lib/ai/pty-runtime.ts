import * as pty from "node-pty";

const DEFAULT_TERM_NAME_UNIX = "xterm-256color";
const DEFAULT_TERM_NAME_WINDOWS = "xterm-color";

export function resolveCliCommandCandidates(
  command: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform !== "win32") return [command];
  return [`${command}.cmd`, `${command}.exe`, command];
}

export function resolveTermName(
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === "win32"
    ? DEFAULT_TERM_NAME_WINDOWS
    : DEFAULT_TERM_NAME_UNIX;
}

export function spawnCliPty(
  command: string,
  args: string[],
  options: Omit<pty.IPtyForkOptions, "name"> & { name?: string },
  platform: NodeJS.Platform = process.platform,
): pty.IPty {
  const candidates = resolveCliCommandCandidates(command, platform);
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return pty.spawn(candidate, args, {
        ...options,
        name: options.name ?? resolveTermName(platform),
      });
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error(`Failed to spawn CLI command "${command}"`);
}

export function writePromptAndEof(
  term: pty.IPty,
  prompt: string,
  platform: NodeJS.Platform = process.platform,
): void {
  term.write(prompt);
  if (platform === "win32") {
    // Ctrl+Z + Enter is EOF in Windows consoles.
    term.write("\x1a\r");
    return;
  }
  // Ctrl+D is EOF on Unix-style terminals.
  term.write("\x04");
}

