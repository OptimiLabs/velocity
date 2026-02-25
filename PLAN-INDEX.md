# Gemini CLI Integration — Plan Index

**Source**: `INTENT.md`
**Total Plans**: 7
**Estimated Complexity**: Medium-High (follows established Codex pattern)

## Plans

| #   | Name                                         | Files              | Depends On     | Status  |
| --- | -------------------------------------------- | ------------------ | -------------- | ------- |
| 1   | Core types and registries                    | 4 modify           | None           | Pending |
| 2   | Gemini paths, config, and session discovery  | 3 create, 0 modify | Plan 1         | Pending |
| 3   | Session parser adapter                       | 1 create, 1 modify | Plan 1, Plan 2 | Pending |
| 4   | Instruction indexing and path categorization | 0 create, 2 modify | Plan 1         | Pending |
| 5   | Google AI adapter                            | 1 create, 1 modify | Plan 1         | Pending |
| 6   | Settings API and hook                        | 2 create, 1 modify | Plan 2         | Pending |
| 7   | Analytics integration and knowledge docs     | 0 create, 0 modify | Plans 1-6      | Pending |

## Execution Order

Plans 1 must be done first (foundation types). Plans 2-6 can be done in parallel after Plan 1. Plan 7 is verification/integration that should be done last.

Recommended serial order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

## File Inventory

### New Files (7)

- `lib/gemini/paths.ts` — Path constants
- `lib/gemini/config.ts` — Config interface and read/write
- `lib/gemini/session-discovery.ts` — Session discovery
- `lib/gemini/session-parser.ts` — JSON session parser
- `lib/providers/adapters/google.ts` — Google AI adapter
- `lib/gemini/settings.ts` — Settings read/write
- `hooks/useGeminiSettings.ts` — React Query hook

### Modified Files (7)

- `types/provider.ts` — Add "gemini" to ConfigProvider union
- `lib/providers/session-registry.ts` — Register gemini provider
- `lib/cost/pricing.ts` — Add Gemini model pricing entries
- `lib/cost/calculator.ts` — Add "gemini" model tier
- `lib/instructions/indexer.ts` — Add GEMINI.md patterns
- `lib/parser/session-utils.ts` — Add GEMINI.md/`.gemini/` categorization
- `lib/providers/ai-registry.ts` — Register GoogleAdapter
- `app/api/settings/route.ts` — Register gemini provider settings

### Test Files (8)

- `__tests__/lib/gemini/paths.test.ts`
- `__tests__/lib/gemini/config.test.ts`
- `__tests__/lib/gemini/session-discovery.test.ts`
- `__tests__/lib/gemini/session-parser.test.ts`
- `__tests__/lib/parser/gemini-path-categorization.test.ts`
- `__tests__/lib/instructions/gemini-instructions.test.ts`
- `__tests__/lib/cost/gemini-pricing.test.ts`
- `__tests__/lib/parser/detect-provider-gemini.test.ts`
