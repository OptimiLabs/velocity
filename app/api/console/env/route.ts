import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function expandHomeDir(inputPath: string): string {
  if (!inputPath.startsWith("~")) return inputPath;
  return inputPath.replace(/^~(?=$|\/|\\)/, os.homedir());
}

function encodeEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@-]*$/.test(value)) return value;
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")}"`;
}

function decodeEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    const unwrapped = trimmed.slice(1, -1);
    if (trimmed.startsWith('"')) {
      return unwrapped
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
    return unwrapped;
  }
  return trimmed;
}

function parseEnvContent(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
    );
    if (!match) continue;
    const key = match[1];
    const valueRaw = match[2] ?? "";
    out[key] = decodeEnvValue(valueRaw);
  }
  return out;
}

function upsertEnvContent(content: string, key: string, value: string): {
  nextContent: string;
  updated: boolean;
} {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.length > 0 ? normalized.split("\n") : [];
  const nextLine = `${key}=${encodeEnvValue(value)}`;
  let updated = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    if (/^\s*#/.test(line)) continue;
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) continue;
    if (match[1] !== key) continue;
    lines[i] = nextLine;
    updated = true;
    break;
  }

  if (!updated) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
      lines.push("");
    }
    lines.push(nextLine);
  }

  const withEof = lines.join("\n");
  return {
    nextContent: withEof.endsWith("\n") ? withEof : `${withEof}\n`,
    updated,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      cwd?: unknown;
      key?: unknown;
      value?: unknown;
    };
    const cwdRaw = typeof body.cwd === "string" ? body.cwd.trim() : "";
    const keyRaw = typeof body.key === "string" ? body.key.trim() : "";
    const valueRaw = typeof body.value === "string" ? body.value : "";

    if (!cwdRaw) {
      return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    }
    if (!keyRaw || !ENV_KEY_PATTERN.test(keyRaw)) {
      return NextResponse.json(
        {
          error:
            "Invalid env key. Use letters, numbers, and underscores, and start with a letter or underscore.",
        },
        { status: 400 },
      );
    }

    const cwd = path.resolve(expandHomeDir(cwdRaw));
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      return NextResponse.json(
        { error: "cwd must be an existing directory" },
        { status: 400 },
      );
    }

    const envPath = path.join(cwd, ".env");
    let current = "";
    let existed = false;
    if (fs.existsSync(envPath)) {
      existed = true;
      current = fs.readFileSync(envPath, "utf-8");
    }

    const { nextContent, updated } = upsertEnvContent(current, keyRaw, valueRaw);
    fs.writeFileSync(envPath, nextContent, "utf-8");

    return NextResponse.json({
      success: true,
      path: envPath,
      created: !existed,
      updated,
      key: keyRaw,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update .env file",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const cwdRaw = (url.searchParams.get("cwd") ?? "").trim();
    if (!cwdRaw) {
      return NextResponse.json({ error: "cwd is required" }, { status: 400 });
    }

    const cwd = path.resolve(expandHomeDir(cwdRaw));
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      return NextResponse.json(
        { error: "cwd must be an existing directory" },
        { status: 400 },
      );
    }

    const envPath = path.join(cwd, ".env");
    if (!fs.existsSync(envPath)) {
      return NextResponse.json({
        success: true,
        path: envPath,
        exists: false,
        entries: {},
      });
    }

    const content = fs.readFileSync(envPath, "utf-8");
    const entries = parseEnvContent(content);
    return NextResponse.json({
      success: true,
      path: envPath,
      exists: true,
      entries,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to read .env file",
      },
      { status: 500 },
    );
  }
}
