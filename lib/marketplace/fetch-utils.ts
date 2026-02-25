export const FETCH_TIMEOUT = 15_000;

export function fetchWithTimeout(
  url: string,
  timeoutMs = FETCH_TIMEOUT,
): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
}

/**
 * Convert a GitHub URL to a raw content base URL.
 * Handles:
 *   github.com/owner/repo              → raw.../owner/repo/main
 *   github.com/owner/repo/tree/main/x  → raw.../owner/repo/main/x
 *   github.com/owner/repo/blob/main/x  → raw.../owner/repo/main/x
 */
export function toRawBase(ghUrl: string): string {
  let path = ghUrl.replace(/^https?:\/\//, "").replace("github.com/", "");

  // Strip /tree/<branch>/ or /blob/<branch>/ → keep the subpath
  const treeBlobRe = /^([^/]+\/[^/]+)\/(?:tree|blob)\/([^/]+)\/?(.*)/;
  const m = path.match(treeBlobRe);
  if (m) {
    const [, repo, branch, subpath] = m;
    const sub = subpath.replace(/\/$/, "");
    return `https://raw.githubusercontent.com/${repo}/${branch}${sub ? `/${sub}` : ""}`;
  }

  // Plain repo URL
  path = path.replace(/\/$/, "");
  return `https://raw.githubusercontent.com/${path}/main`;
}
