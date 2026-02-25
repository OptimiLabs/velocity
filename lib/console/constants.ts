/**
 * Fraction of the context window reserved for Claude's autocompact buffer.
 * Claude triggers autocompact when ~83.5% of the window is used,
 * reserving ~16.5% as a buffer for the compaction summary.
 */
export const AUTOCOMPACT_RATIO = 0.165;
