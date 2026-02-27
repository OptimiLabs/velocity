import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

type InstallState = {
  signature: string;
};

const rootDir = process.cwd();
const nodeModulesDir = join(rootDir, "node_modules");
const statePath = join(nodeModulesDir, ".cache", "velocity", "deps-state.json");
const packageJsonPath = join(rootDir, "package.json");
const bunLockPath = join(rootDir, "bun.lock");

function hasDependenciesInstalled(): boolean {
  if (!existsSync(nodeModulesDir)) return false;
  if (!existsSync(join(nodeModulesDir, ".bin"))) return false;
  return true;
}

async function safeFileHash(path: string): Promise<string> {
  if (!existsSync(path)) return "missing";
  const content = await Bun.file(path).text();
  return String(Bun.hash(content));
}

async function dependencySignature(): Promise<string> {
  const lockHash = await safeFileHash(bunLockPath);
  const pkgHash = await safeFileHash(packageJsonPath);
  const raw = `${lockHash}:${pkgHash}:${Bun.version}`;
  return String(Bun.hash(raw));
}

async function readInstallState(): Promise<InstallState | null> {
  if (!existsSync(statePath)) return null;
  try {
    return (await Bun.file(statePath).json()) as InstallState;
  } catch {
    return null;
  }
}

async function writeInstallState(state: InstallState): Promise<void> {
  mkdirSync(dirname(statePath), { recursive: true });
  await Bun.write(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function runBun(args: string[]): Promise<void> {
  const proc = Bun.spawn([process.execPath, ...args], {
    cwd: rootDir,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    process.exit(code);
  }
}

async function ensureDependencies(): Promise<void> {
  const signature = await dependencySignature();
  const state = await readInstallState();
  const reasons: string[] = [];

  if (!hasDependenciesInstalled()) {
    reasons.push("dependencies are missing");
  }
  if (!state) {
    reasons.push("dependency state is missing");
  } else if (state.signature !== signature) {
    reasons.push("dependency inputs changed");
  }

  if (reasons.length === 0) {
    return;
  }

  console.log(`[dev] Running bun install (${reasons.join(", ")})`);
  await runBun(["install"]);
  await writeInstallState({ signature });
}

async function main(): Promise<void> {
  await ensureDependencies();

  const forwardedArgs = process.argv.slice(2);
  const devArgs =
    forwardedArgs.length > 0
      ? ["run", "dev:next", "--", ...forwardedArgs]
      : ["run", "dev:next"];

  await runBun(devArgs);
}

await main();
