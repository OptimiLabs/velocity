/**
 * Prompt mark tracker for OSC 133 shell integration.
 * Stores line numbers where shell prompts appear, enabling Cmd+Up/Down navigation.
 *
 * OSC 133 sequences (emitted by zsh/bash/fish with shell integration):
 *   \x1b]133;A\x07  — start of prompt
 *   \x1b]133;B\x07  — end of prompt (start of command)
 *   \x1b]133;C\x07  — start of command output
 *   \x1b]133;D;{exit}\x07  — end of command (with exit code)
 */

const RING_BUFFER_SIZE = 1000;

export class PromptMarkTracker {
  private marks: number[] = [];
  private head = 0;
  private count = 0;

  /** Record a prompt at the given line number */
  addMark(line: number): void {
    // Deduplicate: don't add same line twice
    if (this.count > 0) {
      const lastIdx = (this.head - 1 + RING_BUFFER_SIZE) % RING_BUFFER_SIZE;
      if (this.marks[lastIdx] === line) return;
    }
    if (this.marks.length < RING_BUFFER_SIZE) {
      this.marks.push(line);
    } else {
      this.marks[this.head] = line;
    }
    this.head = (this.head + 1) % RING_BUFFER_SIZE;
    if (this.count < RING_BUFFER_SIZE) this.count++;
  }

  /** Get all marks in order (oldest first) */
  getMarks(): number[] {
    if (this.count === 0) return [];
    const result: number[] = [];
    const start = this.count < RING_BUFFER_SIZE ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      result.push(this.marks[(start + i) % RING_BUFFER_SIZE]);
    }
    return result;
  }

  /** Find the nearest prompt above the given line */
  findPrevious(currentLine: number): number | null {
    const marks = this.getMarks();
    for (let i = marks.length - 1; i >= 0; i--) {
      if (marks[i] < currentLine) return marks[i];
    }
    return null;
  }

  /** Find the nearest prompt below the given line */
  findNext(currentLine: number): number | null {
    const marks = this.getMarks();
    for (let i = 0; i < marks.length; i++) {
      if (marks[i] > currentLine) return marks[i];
    }
    return null;
  }

  clear(): void {
    this.marks = [];
    this.head = 0;
    this.count = 0;
  }
}

/** Parse terminal output data for OSC 133;A sequences. Returns true if a prompt start was found. */
export function parseOsc133(data: string): boolean {
  // OSC 133;A marks the start of a prompt
  // Can be terminated by BEL (\x07) or ST (\x1b\\)
  return /\x1b\]133;A(\x07|\x1b\\)/.test(data);
}
