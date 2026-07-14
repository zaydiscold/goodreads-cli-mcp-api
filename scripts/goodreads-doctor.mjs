#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { inspectBuild, resolveRepoRoot } from "./goodreads-runtime.mjs";

const root = resolveRepoRoot(import.meta.url);
const errors = [];
const warnings = [];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: options.env ?? process.env,
    input: options.input ?? "",
    maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024,
    shell: false,
    timeout: options.timeout ?? 8_000,
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    signal: result.signal,
    timedOut: result.error?.code === "ETIMEDOUT",
    stdout: result.stdout ?? "",
  };
}

function gitValue(args) {
  const result = run("git", args, { timeout: 5_000 });
  return result.ok ? result.stdout.trim() : null;
}

function inspectGit() {
  const inside = gitValue(["rev-parse", "--is-inside-work-tree"]) === "true";
  if (!inside) {
    warnings.push("git:not-a-worktree");
    return { insideWorktree: false };
  }

  const branch = gitValue(["branch", "--show-current"]) || null;
  const head = gitValue(["rev-parse", "HEAD"]);
  const upstream = gitValue(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  const dirtyOutput = gitValue(["status", "--porcelain"]);
  const dirtyCount = dirtyOutput ? dirtyOutput.split("\n").filter(Boolean).length : 0;
  if (dirtyCount > 0) warnings.push("git:dirty-worktree");

  let localAhead = null;
  let localBehind = null;
  if (upstream) {
    const counts = gitValue(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]);
    const [ahead, behind] = counts?.split(/\s+/).map(Number) ?? [];
    if (Number.isFinite(ahead) && Number.isFinite(behind)) {
      localAhead = ahead;
      localBehind = behind;
      if (ahead !== 0 || behind !== 0) warnings.push("git:local-upstream-mismatch");
    }
  } else {
    warnings.push("git:no-upstream");
  }

  let remote = { checked: false, reachable: false, head: null, matchesHead: null };
  const upstreamBranch = upstream?.startsWith("origin/")
    ? upstream.slice("origin/".length)
    : branch;
  if (upstreamBranch) {
    const remoteResult = run("git", ["ls-remote", "origin", `refs/heads/${upstreamBranch}`], {
      timeout: 8_000,
    });
    const remoteHead = remoteResult.ok ? remoteResult.stdout.trim().split(/\s+/)[0] || null : null;
    remote = {
      checked: true,
      reachable: remoteResult.ok,
      head: remoteHead,
      matchesHead: remoteHead && head ? remoteHead === head : null,
    };
    if (!remoteResult.ok) warnings.push("git:origin-unreachable");
    else if (!remote.matchesHead) warnings.push("git:live-origin-mismatch");
  }

  return {
    insideWorktree: true,
    branch,
    head,
    upstream,
    dirtyCount,
    localAhead,
    localBehind,
    remote,
  };
}

function permissions(path) {
  if (process.platform === "win32" || !existsSync(path)) return null;
  return (statSync(path).mode & 0o777).toString(8).padStart(3, "0");
}

function variableNames(path, windowsBatch) {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf8");
  const pattern = windowsBatch
    ? /^\s*(?:set\s+)?"?(GOODREADS_[A-Z0-9_]+)=/gim
    : /^\s*(?:export\s+)?(GOODREADS_[A-Z0-9_]+)=/gm;
  return [...content.matchAll(pattern)].map((match) => match[1].toUpperCase()).sort();
}

function inspectAuth() {
  const defaultPath =
    process.platform === "win32"
      ? join(process.env.USERPROFILE ?? homedir(), ".goodreads", "auth.bat")
      : join(homedir(), ".goodreads", "auth.sh");
  const path = process.env.GOODREADS_AUTH_FILE || defaultPath;
  const exists = existsSync(path);
  const mode = permissions(path);
  const namesInFile = variableNames(path, process.platform === "win32");
  const expectedNames = [
    "GOODREADS_COOKIE",
    "GOODREADS_CSRF_TOKEN",
    "GOODREADS_ALLOW_NOTES_PUBLICIZE",
  ];
  const namesInEnvironment = expectedNames.filter((name) => Boolean(process.env[name]));

  if (!exists) warnings.push("auth:file-missing-public-tools-only");
  if (exists && mode && mode !== "600") errors.push("auth:unsafe-file-permissions");

  return {
    path,
    exists,
    permissions: mode,
    securePermissions: mode === null ? null : mode === "600",
    namesInFile,
    namesInEnvironment,
  };
}

function inspectCli(build) {
  const artifact = build.artifacts.cliIndex;
  if (!artifact.exists) return { artifact, runnable: false, version: null };
  const result = run(process.execPath, [artifact.path, "--version"], { timeout: 5_000 });
  if (!result.ok) errors.push("cli:runtime-failed");
  return {
    artifact,
    runnable: result.ok,
    version: result.ok ? result.stdout.trim().split("\n")[0] || null : null,
  };
}

function inspectMcp(build) {
  const artifact = build.artifacts.mcpServer;
  if (!artifact.exists) return { artifact, discoverable: false, toolCount: 0 };

  const input = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "goodreads-doctor", version: "1" },
      },
    },
    { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ]
    .map((message) => JSON.stringify(message))
    .join("\n")
    .concat("\n");
  const result = run(process.execPath, [artifact.path], { input, timeout: 10_000 });

  let tools;
  if (result.ok) {
    for (const line of result.stdout.split("\n")) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (message.id === 2 && Array.isArray(message.result?.tools)) {
          tools = message.result.tools;
          break;
        }
      } catch {
        // Non-JSON stdout means the server is not protocol-clean; handled below.
      }
    }
  }

  const discoverable = Array.isArray(tools);
  if (!discoverable) errors.push("mcp:tool-discovery-failed");
  const toolsJson = discoverable ? JSON.stringify(tools) : "";
  return {
    artifact,
    discoverable,
    toolCount: tools?.length ?? 0,
    toolNames: tools?.map((tool) => tool.name) ?? [],
    inventory: discoverable
      ? {
          jsonBytes: Buffer.byteLength(toolsJson),
          estimatedTokensAtFourChars: Math.ceil(toolsJson.length / 4),
          descriptionCharacters: tools.reduce(
            (sum, tool) => sum + (tool.description?.length ?? 0),
            0,
          ),
          schemaJsonCharacters: tools.reduce(
            (sum, tool) => sum + JSON.stringify(tool.inputSchema ?? {}).length,
            0,
          ),
        }
      : null,
  };
}

const repoExists = existsSync(join(root, "package.json"));
if (!repoExists) errors.push("repo:package-json-missing");

const build = inspectBuild(root);
if (build.missing.length > 0) errors.push(`build:missing-${build.missing.join(",")}`);
if (build.stale.length > 0) errors.push(`build:stale-${build.stale.join(",")}`);

const git = inspectGit();
const auth = inspectAuth();
const cli = inspectCli(build);
const mcp = inspectMcp(build);

const exitCode = errors.length > 0 ? 1 : warnings.length > 0 ? 2 : 0;
const report = {
  status: exitCode === 0 ? "healthy" : exitCode === 1 ? "error" : "warning",
  exitCode,
  timestamp: new Date().toISOString(),
  platform: { os: process.platform, arch: process.arch, node: process.version },
  repo: { root, exists: repoExists, git },
  build: {
    needsBuild: build.needsBuild,
    reasons: build.reasons,
    newestSource: build.newestSource,
    artifacts: build.artifacts,
  },
  auth,
  cli,
  mcp,
  errors,
  warnings,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = exitCode;
