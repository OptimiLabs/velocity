---
name: project-schema-api
description: Analyze this repo's database schema and API routes to answer questions about tables, fields, relationships, endpoints, request/response shapes, or data flow. Use when asked about SQLite schema definitions, migrations, or Next.js Route Handlers under app/api in this project.
---

# Project Schema API

## Overview

Answer schema and API questions by reading authoritative definitions in code and docs, keeping context small and results grounded in file paths.

## Quick Start

- Identify the question type: schema, API, or data flow.
- Use the scripts for fast inventory, then open only the needed files.
- Cite file paths and function/table names in answers; avoid guessing.

## Schema Questions (SQLite)

- Open `lib/db/schema.ts` for core tables, indexes, and migrations.
- Open `lib/db/memory-schema.ts` for memory-system tables (planning/tasking).
- Run `scripts/list_db_tables.py` to quickly list table names.
- Trace table usage via `lib/db/*.ts` and `rg -n "<table_name>"`.
- Report columns, defaults, and constraints from the `CREATE TABLE` blocks.

## API Questions (Next.js Route Handlers)

- Run `scripts/list_api_routes.py` to list `/api` endpoints and methods.
- Open the matching `app/api/**/route.ts` file to inspect handlers.
- Identify request parsing (`request.json()`, `searchParams`) and response shape.
- Follow imports into `lib/*` or `server/*` for business logic.

## Data-Flow Questions (API ↔ DB)

- Start from the API route, follow imported functions into `lib/db/*`.
- Use `rg -n` to find SQL statements or table names.
- Summarize the path: endpoint → handler → DB function → table.

## Guardrails

- Avoid LLM-powered analysis unless explicitly requested.
- Keep token use low: read only targeted files, prefer scripts and `rg`.
- If a definition is missing or ambiguous, state the gap and ask for clarification.

## Resources

- `scripts/list_api_routes.py` — inventory API routes + methods.
- `scripts/list_db_tables.py` — list schema tables from SQLite init files.
- `references/schema.md` — schema file map and lookup tips.
- `references/api.md` — API layout notes and route-path mapping.
