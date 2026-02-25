import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface GitContext {
  branch?: string;
  isWorktree: boolean;
  worktreeRoot?: string;
  isDirty: boolean;
}

async function run(cmd: string, cwd: string): Promise<string> {
  const { stdout } = await execAsync(cmd, { cwd, timeout: 5000 });
  return stdout.trim();
}

export interface GithubInfo {
  url: string | null;
  branch: string;
}

const githubInfoCache = new Map<string, GithubInfo>();

export async function getGithubInfo(projectPath: string): Promise<GithubInfo> {
  const cached = githubInfoCache.get(projectPath);
  if (cached) return cached;

  let url: string | null = null;
  let branch = "main";

  try {
    const remote = await run("git remote get-url origin", projectPath);
    // SSH: git@github.com:owner/repo.git
    const sshMatch = remote.match(
      /git@github\.com:([^/]+\/[^/.]+?)(?:\.git)?$/,
    );
    // HTTPS: https://github.com/owner/repo.git
    const httpsMatch = remote.match(
      /https?:\/\/github\.com\/([^/]+\/[^/.]+?)(?:\.git)?$/,
    );
    const match = sshMatch || httpsMatch;
    if (match) {
      url = `https://github.com/${match[1]}`;
    }
  } catch {
    /* not a git repo or no remote */
  }

  try {
    branch =
      (await run("git symbolic-ref --short HEAD", projectPath)) || "main";
  } catch {
    /* use default */
  }

  const info = { url, branch };
  githubInfoCache.set(projectPath, info);
  return info;
}

export async function getGitContext(cwd: string): Promise<GitContext> {
  const result: GitContext = { isWorktree: false, isDirty: false };

  try {
    result.branch = await run("git branch --show-current", cwd);
  } catch {
    // Not a git repo or git not available
    return result;
  }

  try {
    const gitDir = await run("git rev-parse --git-dir", cwd);
    const commonDir = await run("git rev-parse --git-common-dir", cwd);
    if (gitDir !== commonDir) {
      result.isWorktree = true;
      result.worktreeRoot = await run("git rev-parse --show-toplevel", cwd);
    }
  } catch {
    // ignore
  }

  try {
    const status = await run("git status --porcelain", cwd);
    result.isDirty = status.length > 0;
  } catch {
    // ignore
  }

  return result;
}
