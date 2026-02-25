import { NextResponse } from "next/server";
import { toRawBase, fetchWithTimeout } from "@/lib/marketplace/fetch-utils";
import { aiGenerate } from "@/lib/ai/generate";
import {
  getCached,
  setCache,
  detectSecuritySignals,
  combineSecurityAnalysis,
  formatFindingsForPrompt,
  parseAnalysisResponse,
  SECURITY_SYSTEM_PROMPT_PLUGIN,
} from "@/lib/marketplace/security-analysis";
import type { SecurityFinding } from "@/types/security-analysis";

// --- Content fetching by plugin type ---

const MAX_CONTENT_CHARS = 30_000;

function unique<T>(values: Array<T | null | undefined>): T[] {
  return [...new Set(values.filter((v): v is T => Boolean(v)))];
}

function stripGitHubUrlExtras(url: string): string {
  return url.replace(/[?#].*$/, "").replace(/\/$/, "").replace(/\.git$/, "");
}

function buildRawBaseCandidates(url: string, defaultBranch?: string): string[] {
  const normalizedUrl = stripGitHubUrlExtras(url);
  const repoRootMatch = normalizedUrl.match(
    /^https?:\/\/github\.com\/([^/]+\/[^/]+)$/i,
  );
  if (!repoRootMatch) {
    return [toRawBase(normalizedUrl)];
  }

  const repoPath = repoRootMatch[1];
  return unique([
    defaultBranch
      ? `https://raw.githubusercontent.com/${repoPath}/${defaultBranch}`
      : null,
    `https://raw.githubusercontent.com/${repoPath}/main`,
    `https://raw.githubusercontent.com/${repoPath}/master`,
  ]);
}

async function fetchFromCandidateBases(
  url: string,
  filenames: string[],
  defaultBranch?: string,
): Promise<string[]> {
  const parts: string[] = [];
  const bases = buildRawBaseCandidates(url, defaultBranch);

  for (const base of bases) {
    let foundAny = false;
    const attempted = new Set<string>();
    const lastSegment = base.split("/").pop() ?? "";
    const looksLikeFile = /^[^.].*\.[A-Za-z0-9_-]+$/.test(lastSegment);
    const baseDir =
      looksLikeFile && base.includes("/") ? base.slice(0, base.lastIndexOf("/")) : base;

    if (looksLikeFile) {
      try {
        attempted.add(base);
        const res = await fetchWithTimeout(base);
        if (res.ok) {
          parts.push(`--- ${lastSegment} ---\n${await res.text()}`);
          foundAny = true;
        }
      } catch {
        // continue
      }
    }

    for (const filename of filenames) {
      try {
        const targetUrl = `${baseDir}/${filename}`;
        if (attempted.has(targetUrl)) continue;
        attempted.add(targetUrl);
        const res = await fetchWithTimeout(targetUrl);
        if (!res.ok) continue;
        const text = await res.text();
        parts.push(`--- ${filename} ---\n${text}`);
        foundAny = true;
      } catch {
        // continue
      }
    }
    if (foundAny) break;
  }

  return parts;
}

async function fetchPluginContent(
  type: string,
  url: string,
  opts?: { defaultBranch?: string },
): Promise<string> {
  const parts: string[] = [];

  switch (type) {
    case "skill": {
      parts.push(
        ...(await fetchFromCandidateBases(
          url,
          ["SKILL.md", "README.md", "package.json", "install.sh", "setup.sh"],
          opts?.defaultBranch,
        )),
      );
      break;
    }

    case "marketplace-plugin": {
      parts.push(
        ...(await fetchFromCandidateBases(
          url,
          [
            "README.md",
            "package.json",
            ".claude-plugin/plugin.json",
            "install.sh",
            "setup.sh",
          ],
          opts?.defaultBranch,
        )),
      );

      const base = toRawBase(url);
      const rawMatch = base.match(
        /raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/([^/]+)\/(.*)/,
      );
      if (!rawMatch) break;
      const [, repoPath, branch, subpath] = rawMatch;
      const contentsBase = `https://api.github.com/repos/${repoPath}/contents/${subpath}`;

      for (const dir of ["agents", "skills", "commands"]) {
        try {
          const res = await fetchWithTimeout(
            `${contentsBase}/${dir}?ref=${branch}`,
          );
          if (!res.ok) continue;
          const files = (await res.json()) as { name: string }[];
          for (const file of files) {
            if (!file.name.endsWith(".md")) continue;
            try {
              const contentRes = await fetchWithTimeout(
                `${base}/${dir}/${file.name}`,
              );
              if (contentRes.ok) {
                parts.push(
                  `--- ${dir}/${file.name} ---\n${await contentRes.text()}`,
                );
              }
            } catch {
              // skip individual file
            }
          }
        } catch {
          // skip directory
        }
      }
      break;
    }

    case "mcp-server":
    case "unclassified":
    case "plugin": {
      parts.push(
        ...(await fetchFromCandidateBases(
          url,
          ["package.json", "README.md", "install.sh", "setup.sh"],
          opts?.defaultBranch,
        )),
      );
      break;
    }

    case "hook": {
      parts.push(
        ...(await fetchFromCandidateBases(
          url,
          ["README.md", "package.json", "hook.js", "index.js"],
          opts?.defaultBranch,
        )),
      );
      break;
    }
  }

  const combined = parts.join("\n\n");
  if (combined.length > MAX_CONTENT_CHARS) {
    return combined.slice(0, MAX_CONTENT_CHARS) + "\n\n[...truncated]";
  }
  return combined;
}

function buildUserPrompt(
  content: string,
  pluginName: string,
  pluginType: string,
  deterministicFindings: SecurityFinding[],
): string {
  const deterministicBlock = formatFindingsForPrompt(deterministicFindings);
  return `Analyze this plugin (name: "${pluginName}", type: "${pluginType}") for security risks:

<plugin-content>
${content}
</plugin-content>

<deterministic-signal-scan>
${deterministicBlock}
</deterministic-signal-scan>`;
}

// --- POST handler ---

export async function POST(request: Request) {
  try {
    const { type, url, name, defaultBranch } = await request.json();

    if (!type || !url) {
      return NextResponse.json(
        { error: "type and url are required" },
        { status: 400 },
      );
    }

    if (!/^https?:\/\//i.test(String(url))) {
      return NextResponse.json(
        { error: "Only remote HTTP(S) plugin URLs can be analyzed" },
        { status: 422 },
      );
    }

    // Check cache
    const resolvedBranch =
      typeof defaultBranch === "string" && defaultBranch.trim()
        ? defaultBranch.trim()
        : "__default";
    const cacheKey = `${type}:${url}:${resolvedBranch}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Fetch plugin content
    const content = await fetchPluginContent(type, url, {
      defaultBranch:
        typeof defaultBranch === "string" && defaultBranch.trim()
          ? defaultBranch.trim()
          : undefined,
    });
    if (!content.trim()) {
      return NextResponse.json(
        { error: "Could not fetch plugin content for analysis" },
        { status: 422 },
      );
    }
    const deterministicFindings = detectSecuritySignals(content);

    // Send to LLM
    const userPrompt = buildUserPrompt(
      content,
      name || "unknown",
      type,
      deterministicFindings,
    );
    const raw = await aiGenerate(userPrompt, {
      system: SECURITY_SYSTEM_PROMPT_PLUGIN,
      timeoutMs: 120_000,
    });

    // Parse response
    const aiResult = parseAnalysisResponse(raw);
    const result = combineSecurityAnalysis(aiResult, deterministicFindings);

    // Cache and return
    setCache(cacheKey, result);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Security analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
