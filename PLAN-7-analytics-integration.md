# PLAN-7: Analytics Integration and Knowledge Docs Updates

> For Claude: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Objective

Verify that Gemini sessions appear correctly in analytics charts, provider breakdown, and filter bar. Run the full test suite to confirm no regressions. This plan is primarily verification and cleanup — all core implementation is done in Plans 1-6.

## Dependencies

- Plans 1-6 (all core implementation complete)

## Files to Modify

None required — this plan verifies integration works end-to-end. Files may need modification only if integration issues are discovered.

---

## Task 1: Run the full test suite

**Run**: `bun test`

All existing tests plus all new Gemini tests must pass. If any fail, investigate and fix.

Expected test files:

- `__tests__/lib/parser/detect-provider-gemini.test.ts` (Plan 1)
- `__tests__/lib/cost/gemini-pricing.test.ts` (Plan 1)
- `__tests__/lib/gemini/paths.test.ts` (Plan 2)
- `__tests__/lib/gemini/config.test.ts` (Plan 2)
- `__tests__/lib/gemini/session-discovery.test.ts` (Plan 2)
- `__tests__/lib/gemini/session-parser.test.ts` (Plan 3)
- `__tests__/lib/instructions/gemini-instructions.test.ts` (Plan 4)
- `__tests__/lib/parser/gemini-path-categorization.test.ts` (Plan 4)
- `__tests__/lib/providers/google-adapter.test.ts` (Plan 5)
- `__tests__/lib/gemini/settings.test.ts` (Plan 6)

---

## Task 2: Verify TypeScript compilation

**Run**: `bunx tsc --noEmit`

No type errors should be present. Common issues to watch for:

- `ModelTier` union not including `"gemini"` in all switch statements
- `ConfigProvider` union not handled in pattern matches
- Missing exports from new modules

---

## Task 3: Verify linting passes

**Run**: `bun lint` (or `bunx next lint`)

No lint errors in new files.

---

## Task 4: Verify analytics integration

The analytics system works through these layers:

1. Sessions have a `provider` column (set by `detectSessionProvider`)
2. Analytics queries group by provider
3. Charts use `getSessionProvider(id).chartColor` for colors
4. Filter bar uses `getAllSessionProviders()` for chip options

Since we registered "gemini" in the session registry (Plan 1), analytics should automatically:

- Show "Gemini" in the provider filter chips
- Use blue (`hsl(217, 91%, 60%)`) for Gemini in charts
- Include Gemini sessions in provider breakdown API responses

**Verification**: Search for any hardcoded provider lists that might need updating:

```bash
# Search for hardcoded provider arrays/lists
rg '"claude".*"codex"' --type ts
rg "claude.*codex" --type ts -g '!*.test.ts' -g '!*.md' -g '!PLAN-*'
```

If any hardcoded `["claude", "codex"]` arrays are found, they need to be updated to include `"gemini"` or (better) refactored to use `getAllSessionProviders()`.

---

## Task 5: Check for exhaustive switch/if-else chains

Search for any code that handles providers with explicit switch/if-else that might miss "gemini":

```bash
rg "case .claude" --type ts
rg 'provider === "claude"' --type ts
rg "ConfigProvider" --type ts
```

Review each match. If there are switch statements or if-else chains that handle "claude" and "codex" explicitly, they need a "gemini" case. The registry pattern should handle most cases automatically, but UI components sometimes have hardcoded logic.

---

## Task 6: Verify chart color availability

Check that `bg-chart-7` (used for gemini tier color) exists in the Tailwind theme. If it doesn't exist, update `TIER_COLORS.gemini` to use `"bg-blue-500"` instead.

```bash
rg "chart-7" tailwind.config.ts app/globals.css
```

---

## Anti-Hallucination Guardrails

1. **This plan does NOT create new source files** — it only verifies and potentially fixes integration issues
2. **Do NOT modify analytics components unless a specific bug is found** — the registry pattern should handle everything
3. **Do NOT create documentation files** unless explicitly requested by the user
4. **Do NOT modify the database schema** — the `provider` column already exists and accepts any string
5. **If hardcoded provider lists are found**, prefer refactoring to use the registry over adding "gemini" to the list

## Acceptance Criteria

- [ ] `bun test` passes all tests (existing + new)
- [ ] `bunx tsc --noEmit` reports no type errors
- [ ] Linting passes with no errors in new files
- [ ] No hardcoded `["claude", "codex"]` arrays exist without "gemini"
- [ ] All switch/if-else chains that handle providers include "gemini" or use the registry
- [ ] Chart colors are valid Tailwind classes
- [ ] The provider filter bar shows "Gemini" as an option (via `getAllSessionProviders()`)
