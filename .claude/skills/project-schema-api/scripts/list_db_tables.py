#!/usr/bin/env python3
"""
List SQLite tables defined in lib/db/schema.ts and lib/db/memory-schema.ts.

Usage:
  scripts/list_db_tables.py [--root <repo-root>] [--no-memory]
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

TABLE_RE = re.compile(
    r"CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([A-Za-z0-9_]+)\s*\(",
    re.I,
)


def extract_tables(path: Path) -> list[str]:
    try:
        content = path.read_text()
    except Exception:
        return []
    return sorted({m.group(1) for m in TABLE_RE.finditer(content)})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="Repo root (default: .)")
    parser.add_argument("--no-memory", action="store_true", help="Skip memory schema")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    schema_path = root / "lib/db/schema.ts"
    memory_path = root / "lib/db/memory-schema.ts"

    if not schema_path.exists():
        print(f"Missing {schema_path}", file=sys.stderr)
        return 1

    core_tables = extract_tables(schema_path)
    print("Core tables (lib/db/schema.ts):")
    for name in core_tables:
        print(f"- {name}")

    if not args.no_memory:
        if not memory_path.exists():
            print(f"\nMissing {memory_path}", file=sys.stderr)
            return 1
        memory_tables = extract_tables(memory_path)
        print("\nMemory tables (lib/db/memory-schema.ts):")
        for name in memory_tables:
            print(f"- {name}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
