/**
 * Regenerates the per-app deploy branches (gen-main, panel-main) from main.
 *
 * Each deploy branch is a pruned snapshot of main containing one app plus the
 * shared packages/pdf-pipeline. Deploy branches are force-updated and must
 * never be merged back into main — change main, then re-run this script.
 *
 * Usage (from main, clean worktree):
 *   bun run sync:branches            # regenerate both branches locally
 *   bun run sync:branches:push       # regenerate and force-push to origin
 *   bun scripts/sync-app-branches.ts gen --push   # single app
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

type AppConfig = {
  /** CLI name */
  app: "gen" | "panel";
  branch: "gen-main" | "panel-main";
  /** Directory under apps/ that this branch keeps */
  appDir: "genbooks" | "panel_books";
  /** Root scripts for the deploy branch (Coolify uses build:/start: names) */
  scripts: Record<string, string>;
};

const appConfigs: AppConfig[] = [
  {
    app: "gen",
    branch: "gen-main",
    appDir: "genbooks",
    scripts: {
      "dev": "bun run --cwd apps/genbooks dev",
      "build": "bun run --cwd apps/genbooks build",
      "start": "bun run --cwd apps/genbooks start",
      "dev:genbooks": "bun run --cwd apps/genbooks dev",
      "build:genbooks": "bun run --cwd apps/genbooks build",
      "start:genbooks": "bun run --cwd apps/genbooks start",
      "test": "bun run --cwd packages/pdf-pipeline test && bun run --cwd apps/genbooks test",
      "typecheck": "bun run --cwd packages/pdf-pipeline typecheck && bun run --cwd apps/genbooks typecheck",
    },
  },
  {
    app: "panel",
    branch: "panel-main",
    appDir: "panel_books",
    scripts: {
      "dev": "bun run --cwd apps/panel_books dev",
      "build": "bun run --cwd apps/panel_books build",
      "start": "bun run --cwd apps/panel_books start",
      "dev:panel": "bun run --cwd apps/panel_books dev",
      "build:panel": "bun run --cwd apps/panel_books build",
      "start:panel": "bun run --cwd apps/panel_books start",
      "test": "bun run --cwd packages/pdf-pipeline test",
      "typecheck": "bun run --cwd packages/pdf-pipeline typecheck && bun run --cwd apps/panel_books typecheck",
    },
  },
];

/** Paths only main needs; stripped from every deploy branch. */
const mainOnlyPaths = ["promo", "DEPLOY.md", "scripts", ".github", "tsconfig.json"];

const repoRoot = process.cwd();
const push = process.argv.includes("--push");
const requestedApps = process.argv
  .slice(2)
  .filter((arg) => arg !== "--push") as Array<AppConfig["app"]>;

const selectedConfigs =
  requestedApps.length > 0
    ? appConfigs.filter((config) => requestedApps.includes(config.app))
    : appConfigs;

if (selectedConfigs.length === 0) {
  console.error("No valid apps selected. Use: gen panel");
  process.exit(1);
}

assertOnMain();
assertCleanWorktree();

for (const config of selectedConfigs) {
  syncBranch(config);
}

function syncBranch(config: AppConfig) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), `${config.branch}-`));

  try {
    runGit(["worktree", "add", "--detach", tempDir, "HEAD"], repoRoot);

    const otherAppDirs = appConfigs
      .filter((item) => item.app !== config.app)
      .map((item) => path.join("apps", item.appDir));

    runGit(
      ["rm", "-r", "-q", "--ignore-unmatch", ...otherAppDirs, ...mainOnlyPaths],
      tempDir,
    );

    writeFileSync(
      path.join(tempDir, "package.json"),
      buildPackageJson(config),
    );
    writeFileSync(path.join(tempDir, "README.md"), buildReadme(config));

    // The root lockfile references all workspaces; regenerate it for the
    // pruned workspace set so `bun install --frozen-lockfile` works on deploy.
    runBun(["install", "--lockfile-only"], tempDir);

    runGit(["add", "package.json", "README.md", "bun.lock"], tempDir);

    if (!hasChanges(tempDir)) {
      console.log(`No changes for ${config.branch}.`);
      return;
    }

    runGit(["commit", "-q", "-m", `Sync ${config.branch} from main`], tempDir);

    const commit = runGit(["rev-parse", "HEAD"], tempDir).trim();
    const newTree = runGit(["rev-parse", "HEAD^{tree}"], tempDir).trim();
    const oldTree = runGit(
      ["rev-parse", `${config.branch}^{tree}`],
      repoRoot,
      false,
    ).trim();

    // Skip unchanged branches so pushes to main only redeploy the app that
    // actually changed.
    if (newTree === oldTree) {
      console.log(`${config.branch} already up to date.`);
      return;
    }

    runGit(["branch", "-f", config.branch, commit], repoRoot);

    if (push) {
      runGit(
        ["push", "--force-with-lease", "origin", `${config.branch}:${config.branch}`],
        repoRoot,
      );
    }

    console.log(`Synced ${config.branch} from main.`);
  } finally {
    runGit(["worktree", "remove", "--force", tempDir], repoRoot, false);
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function assertOnMain() {
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot).trim();
  if (branch !== "main") {
    console.error(`Run this from main. Current branch: ${branch}`);
    process.exit(1);
  }
}

function assertCleanWorktree() {
  const status = runGit(["status", "--porcelain"], repoRoot).trim();
  if (status) {
    console.error("Working tree must be clean before syncing app branches.");
    process.exit(1);
  }
}

function hasChanges(cwd: string) {
  return runGit(["status", "--porcelain"], cwd).trim().length > 0;
}

function buildPackageJson(config: AppConfig) {
  const packageJson = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ) as Record<string, unknown>;
  packageJson.scripts = config.scripts;
  return `${JSON.stringify(packageJson, null, 2)}\n`;
}

function buildReadme(config: AppConfig) {
  return `# schoolbooks — ${config.branch}

Generated deploy branch for \`apps/${config.appDir}\`, derived from \`main\`.
Do not commit here and never merge this branch into \`main\`; change \`main\`
and re-run \`bun run sync:branches\` instead.

\`\`\`bash
bun install --frozen-lockfile
bun run build
bun run start
\`\`\`
`;
}

function runGit(args: string[], cwd: string, failOnError = true) {
  return run(["git", ...args], cwd, failOnError);
}

function runBun(args: string[], cwd: string) {
  return run(["bun", ...args], cwd, true);
}

function run(cmd: string[], cwd: string, failOnError: boolean) {
  const result = Bun.spawnSync({ cmd, cwd, stdout: "pipe", stderr: "pipe" });

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();

  if (result.exitCode !== 0 && failOnError) {
    const detail = stderr || stdout || `${cmd.join(" ")} failed`;
    throw new Error(detail.trim());
  }

  return stdout;
}
