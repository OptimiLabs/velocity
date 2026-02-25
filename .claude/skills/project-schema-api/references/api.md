# API Reference (Next.js App Router)

## Where routes live
- API routes are Next.js Route Handlers in `app/api/**/route.ts`.
- Map file path to endpoint: `app/api/foo/bar/route.ts` → `/api/foo/bar`.
- Dynamic segments use `[name]` in the path, e.g. `app/api/skills/[name]/route.ts` → `/api/skills/[name]`.

## How to inspect handlers
- Look for exported functions: `export async function GET/POST/...`.
- Read request parsing: `request.json()` or `request.nextUrl.searchParams`.
- Read response shape: `NextResponse.json(...)` or `new Response(...)`.

## Fast inventory
- Run `scripts/list_api_routes.py` to list endpoints and HTTP methods.
- Use `rg -n "export async function (GET|POST|PUT|PATCH|DELETE)" app/api`.

## High-level architecture
- `docs/ONBOARDING.md` summarizes API structure and key route groups.
