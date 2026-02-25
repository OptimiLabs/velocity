import { NextResponse } from "next/server";
import { aiGenerate } from "@/lib/ai/generate";
import {
  getCached,
  setCache,
  parseAnalysisResponse,
  SECURITY_SYSTEM_PROMPT_REPO,
} from "@/lib/marketplace/security-analysis";

const GITHUB_HEADERS: Record<string, string> = {
  Accept: "application/vnd.github.v3+json",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
    : {}),
};

const FETCH_TIMEOUT = 8_000;
const MAX_CONTENT_CHARS = 30_000;

// --- Fetch repo content for analysis ---

function unique<T>(values: Array<T | null | undefined>): T[] {
  return [...new Set(values.filter((v): v is T => Boolean(v)))];
}

async function resolveBranchCandidates(
  owner: string,
  repo: string,
): Promise<string[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: GITHUB_HEADERS,
    });
    if (!res.ok) return ["main", "master"];
    const data = (await res.json()) as { default_branch?: string };
    return unique([data.default_branch, "main", "master"]);
  } catch {
    return ["main", "master"];
  }
}

async function fetchRepoContent(owner: string, repo: string): Promise<string> {
  const filesToFetch = [
    "README.md",
    "package.json",
    "install.sh",
    "setup.sh",
    "Makefile",
    ".claude-plugin/plugin.json",
  ];

  for (const branch of await resolveBranchCandidates(owner, repo)) {
    const parts: string[] = [];
    const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;

    await Promise.all(
      filesToFetch.map(async (filename) => {
        try {
          const res = await fetch(`${rawBase}/${filename}`, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT),
            headers: GITHUB_HEADERS,
          });
          if (res.ok) {
            const text = await res.text();
            if (text.trim()) {
              parts.push(`--- ${filename} ---\n${text}`);
            }
          }
        } catch {
          // skip individual file failures
        }
      }),
    );

    const combined = parts.join("\n\n");
    if (!combined.trim()) continue;
    if (combined.length > MAX_CONTENT_CHARS) {
      return combined.slice(0, MAX_CONTENT_CHARS) + "\n\n[...truncated]";
    }
    return combined;
  }

  return "";
}

function buildRepoUserPrompt(
  content: string,
  owner: string,
  repo: string,
): string {
  return `Analyze this repository (${owner}/${repo}) for security risks:

<repo-content>
${content}
</repo-content>`;
}

// --- POST handler ---

export async function POST(request: Request) {
  try {
    const { owner, repo } = await request.json();

    if (!owner || !repo) {
      return NextResponse.json(
        { error: "owner and repo are required" },
        { status: 400 },
      );
    }

    // Check cache
    const cacheKey = `repo:${owner}/${repo}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Fetch repo content
    const content = await fetchRepoContent(owner, repo);
    if (!content.trim()) {
      return NextResponse.json(
        { error: "Could not fetch repository content for analysis" },
        { status: 422 },
      );
    }

    // Send to LLM
    const userPrompt = buildRepoUserPrompt(content, owner, repo);
    const raw = await aiGenerate(userPrompt, {
      system: SECURITY_SYSTEM_PROMPT_REPO,
      timeoutMs: 120_000,
    });

    // Parse response
    const result = parseAnalysisResponse(raw);

    // Cache and return
    setCache(cacheKey, result);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Repository security analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
