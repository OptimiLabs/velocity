#!/usr/bin/env python3
"""
List Next.js App Router API routes with HTTP methods.

Default target: app/api/**/route.(ts|tsx|js|jsx)
Usage:
  scripts/list_api_routes.py [--root <repo-root>] [--api-dir <path>]
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

METHOD_RE = re.compile(
    r"export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b"
)
CONST_RE = re.compile(
    r"export\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b"
)


def find_api_dir(root: Path, override: str | None) -> Path | None:
    if override:
        candidate = (root / override).resolve()
        return candidate if candidate.exists() else None
    for rel in ("app/api", "src/app/api"):
        candidate = (root / rel).resolve()
        if candidate.exists():
            return candidate
    return None


def route_path(api_dir: Path, file_path: Path) -> str:
    rel = file_path.relative_to(api_dir)
    parts = list(rel.parts)
    if parts[-1].startswith("route."):
        parts = parts[:-1]
    path = "/".join(parts)
    return "/api" + ("/" + path if path else "")


def extract_methods(file_path: Path) -> list[str]:
    try:
        content = file_path.read_text()
    except Exception:
        return []
    methods = set(METHOD_RE.findall(content))
    methods.update(CONST_RE.findall(content))
    return sorted(methods)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="Repo root (default: .)")
    parser.add_argument("--api-dir", default=None, help="Override api dir (relative to root)")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    api_dir = find_api_dir(root, args.api_dir)
    if not api_dir:
        print("No app/api directory found.", file=sys.stderr)
        return 1

    route_files = sorted(
        api_dir.rglob("route.*"),
        key=lambda p: str(p),
    )
    rows = []
    for file_path in route_files:
        if file_path.suffix not in {".ts", ".tsx", ".js", ".jsx"}:
            continue
        methods = extract_methods(file_path)
        rows.append(
            (
                route_path(api_dir, file_path),
                ",".join(methods) if methods else "-",
                file_path.relative_to(root),
            )
        )

    width = max((len(r[0]) for r in rows), default=10)
    for path, methods, rel_path in rows:
        print(f"{path.ljust(width)}  {methods.ljust(12)}  {rel_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
