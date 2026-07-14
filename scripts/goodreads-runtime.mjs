import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_ARTIFACTS = [
  ["cliIndex", "cli/dist/index.js"],
  ["cliEngine", "cli/dist/engine.js"],
  ["mcpServer", "mcp/dist/server.js"],
];

const BUILD_INPUTS = [
  "api-map",
  "cli/src",
  "cli/scripts",
  "mcp/src",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "cli/package.json",
  "cli/tsconfig.json",
  "mcp/package.json",
  "mcp/tsconfig.json",
];

export function resolveRepoRoot(moduleUrl = import.meta.url) {
  const modulePath = realpathSync(fileURLToPath(moduleUrl));
  return resolve(dirname(modulePath), "..");
}

function newestFileIn(path, current = undefined) {
  if (!existsSync(path)) return current;

  const stat = statSync(path);
  if (stat.isFile()) {
    if (!current || stat.mtimeMs > current.mtimeMs) {
      return { path, mtimeMs: stat.mtimeMs };
    }
    return current;
  }

  if (!stat.isDirectory()) return current;
  let newest = current;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }
    newest = newestFileIn(join(path, entry.name), newest);
  }
  return newest;
}

function artifactDetails(root, relativePath) {
  const path = join(root, relativePath);
  if (!existsSync(path)) {
    return { path, relativePath, exists: false, size: 0, mtimeMs: null };
  }
  const stat = statSync(path);
  return {
    path,
    relativePath,
    exists: stat.isFile(),
    size: stat.isFile() ? stat.size : 0,
    mtimeMs: stat.mtimeMs,
  };
}

export function inspectBuild(root) {
  let newestSource;
  for (const relativePath of BUILD_INPUTS) {
    newestSource = newestFileIn(join(root, relativePath), newestSource);
  }

  const artifacts = Object.fromEntries(
    REQUIRED_ARTIFACTS.map(([name, relativePath]) => [name, artifactDetails(root, relativePath)]),
  );
  const missing = Object.entries(artifacts)
    .filter(([, artifact]) => !artifact.exists)
    .map(([name]) => name);
  const stale = Object.entries(artifacts)
    .filter(
      ([, artifact]) =>
        artifact.exists && newestSource && artifact.mtimeMs + 1 < newestSource.mtimeMs,
    )
    .map(([name]) => name);

  const reasons = [];
  if (missing.length > 0) reasons.push(`missing:${missing.join(",")}`);
  if (stale.length > 0) reasons.push(`stale:${stale.join(",")}`);

  return {
    root,
    newestSource: newestSource ?? null,
    artifacts,
    missing,
    stale,
    needsBuild: missing.length > 0 || stale.length > 0,
    reasons,
  };
}

export function buildLockPath(root) {
  const key = createHash("sha256").update(realpathSync(root)).digest("hex").slice(0, 16);
  return join(tmpdir(), `goodreads-mcp-build-${key}.lock`);
}

export async function acquireBuildLock(root, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const staleMs = options.staleMs ?? 600_000;
  const pollMs = options.pollMs ?? 250;
  const lockPath = buildLockPath(root);
  const startedAt = Date.now();

  while (true) {
    try {
      mkdirSync(lockPath);
      return {
        path: lockPath,
        release() {
          rmSync(lockPath, { recursive: true, force: true });
        },
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;

      try {
        const ageMs = Date.now() - statSync(lockPath).mtimeMs;
        if (ageMs > staleMs) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (statError?.code !== "ENOENT") throw statError;
        continue;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`Timed out waiting for build lock: ${lockPath}`);
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, pollMs));
    }
  }
}
