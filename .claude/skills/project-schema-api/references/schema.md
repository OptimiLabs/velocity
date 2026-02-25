# Schema Reference (claude-best)

## Core schema
- `lib/db/schema.ts` — `initSchema()` contains the canonical `CREATE TABLE` statements, indexes, and versioned migrations.
- `CURRENT_SCHEMA_VERSION` indicates migration gates; read the version blocks for changes.

## Memory schema
- `lib/db/memory-schema.ts` — `initMemorySchema()` defines memory-planning tables (tasks, chunks, approvals, etc.).

## Query helpers
- `lib/db/*.ts` holds table-specific CRUD/query helpers. Use `rg -n "<table_name>" lib/db` to trace usage.

## Tips
- Use `scripts/list_db_tables.py` for a fast inventory of table names.
- For column details, read the `CREATE TABLE` block in the schema file.
