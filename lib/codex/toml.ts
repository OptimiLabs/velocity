import { parse, stringify } from "smol-toml";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

export function readToml<T = Record<string, unknown>>(filePath: string): T {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return parse(raw) as T;
  } catch {
    return {} as T;
  }
}

export function writeToml<T extends Record<string, unknown>>(
  filePath: string,
  data: T,
): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, stringify(data) + "\n", "utf-8");
}
