import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchRepoTreeWithBranchMock = vi.fn();
const resolveRepoComponentsMock = vi.fn();

vi.mock("@/lib/marketplace/discovery", () => ({
  fetchRepoTreeWithBranch: fetchRepoTreeWithBranchMock,
  resolveRepoComponents: resolveRepoComponentsMock,
}));

describe("GET /api/marketplace/plugin-details", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchRepoTreeWithBranchMock.mockReset();
    resolveRepoComponentsMock.mockReset();
  });

  it("returns component token estimates and total", async () => {
    fetchRepoTreeWithBranchMock.mockResolvedValue({
      tree: [{ path: "skills/reviewer/SKILL.md", type: "blob" }],
      branch: "main",
    });
    resolveRepoComponentsMock.mockResolvedValue({
      components: [
        {
          id: "skill:skills/reviewer/SKILL.md",
          kind: "skill",
          name: "reviewer",
          primaryPath: "skills/reviewer/SKILL.md",
          contextDir: "skills/reviewer",
          downloadUrl:
            "https://raw.githubusercontent.com/acme/repo/main/skills/reviewer/SKILL.md",
          githubUrl:
            "https://github.com/acme/repo/blob/main/skills/reviewer/SKILL.md",
          estimatedTokens: 210,
        },
        {
          id: "command:commands/test.md",
          kind: "command",
          name: "test",
          primaryPath: "commands/test.md",
          contextDir: "commands",
          downloadUrl:
            "https://raw.githubusercontent.com/acme/repo/main/commands/test.md",
          githubUrl:
            "https://github.com/acme/repo/blob/main/commands/test.md",
          estimatedTokens: 90,
        },
      ],
      readme: "# Repo",
      packageJsons: [],
    });

    const { GET } = await import("@/app/api/marketplace/plugin-details/route");
    const req = new Request(
      "http://localhost/api/marketplace/plugin-details?owner=acme&repo=repo&branch=main",
    );
    const res = await GET(req as never);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.estimatedTokensTotal).toBe(300);
    expect(data.components[0].estimatedTokens).toBe(210);
    expect(data.components[1].estimatedTokens).toBe(90);
    expect(data.estimator).toMatchObject({
      method: "chars_div_4",
      version: "1",
      charsPerToken: 4,
    });
    expect(data.securitySignals).toBeUndefined();
    expect(resolveRepoComponentsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "repo",
        branch: "main",
        includeDescriptions: true,
        includeReadmeFallback: true,
      }),
    );
  });

  it("returns 400 if owner/repo params are missing", async () => {
    const { GET } = await import("@/app/api/marketplace/plugin-details/route");
    const req = new Request("http://localhost/api/marketplace/plugin-details");
    const res = await GET(req as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing owner or repo param" });
  });

  it("returns cached details for repeated requests", async () => {
    fetchRepoTreeWithBranchMock.mockResolvedValue({
      tree: [{ path: "skills/reviewer/SKILL.md", type: "blob" }],
      branch: "main",
    });
    resolveRepoComponentsMock.mockResolvedValue({
      components: [],
      readme: undefined,
      packageJsons: [],
    });

    const { GET } = await import("@/app/api/marketplace/plugin-details/route");
    const req = new Request(
      "http://localhost/api/marketplace/plugin-details?owner=acme&repo=repo&branch=main",
    );

    const first = await GET(req as never);
    expect(first.status).toBe(200);
    const second = await GET(req as never);
    expect(second.status).toBe(200);

    expect(fetchRepoTreeWithBranchMock).toHaveBeenCalledTimes(1);
    expect(resolveRepoComponentsMock).toHaveBeenCalledTimes(1);
  });
});
