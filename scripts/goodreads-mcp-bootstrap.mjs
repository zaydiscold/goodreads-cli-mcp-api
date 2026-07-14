#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { acquireBuildLock, inspectBuild, resolveRepoRoot } from "./goodreads-runtime.mjs";

const root = resolveRepoRoot(import.meta.url);

function stderr(message) {
  process.stderr.write(`[goodreads-mcp] ${message}\n`);
}

function runBuild() {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, ["build"], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    input: "",
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });

  // MCP stdout is reserved for JSON-RPC. Build output must never reach it.
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    throw new Error(`Unable to run ${command}: ${result.error.code ?? result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Build failed with exit code ${result.status ?? "unknown"}`);
  }
}

async function ensureBuild() {
  let state = inspectBuild(root);
  if (process.env.GOODREADS_MCP_FORCE_BUILD !== "1" && !state.needsBuild) return state;

  const lock = await acquireBuildLock(root);
  try {
    // A different launcher may have completed the build while this process waited.
    state = inspectBuild(root);
    if (process.env.GOODREADS_MCP_FORCE_BUILD === "1" || state.needsBuild) {
      stderr(`building runtime (${state.reasons.join("; ") || "forced"})`);
      runBuild();
    }
    state = inspectBuild(root);
    if (state.needsBuild) {
      throw new Error(`Build completed but artifacts remain invalid: ${state.reasons.join("; ")}`);
    }
    return state;
  } finally {
    lock.release();
  }
}

try {
  const state = await ensureBuild();
  const serverPath = state.artifacts.mcpServer.path;
  if (!existsSync(serverPath)) throw new Error(`MCP server artifact is missing: ${serverPath}`);
  await import(pathToFileURL(serverPath).href);
} catch (error) {
  stderr(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
