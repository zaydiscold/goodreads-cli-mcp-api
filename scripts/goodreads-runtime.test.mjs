import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveBuildInvocation } from "./goodreads-runtime.mjs";

test("Windows runs Corepack through ComSpec instead of spawning a .cmd directly", () => {
  assert.deepEqual(resolveBuildInvocation("win32", { ComSpec: "C:\\Windows\\System32\\cmd.exe" }), {
    command: "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", "corepack.cmd pnpm build"],
  });
});

test("POSIX invokes pnpm directly", () => {
  assert.deepEqual(resolveBuildInvocation("linux", {}), {
    command: "pnpm",
    args: ["build"],
  });
});

test("CLI build makes a freshly generated entry point executable", async () => {
  const root = await mkdtemp(join(tmpdir(), "goodreads-build-test-"));
  try {
    await mkdir(join(root, "cli", "scripts"), { recursive: true });
    await mkdir(join(root, "cli", "dist"), { recursive: true });
    await mkdir(join(root, "api-map"));
    const script = join(root, "cli", "scripts", "copy-api-map.mjs");
    await cp(new URL("../cli/scripts/copy-api-map.mjs", import.meta.url), script);
    const bin = join(root, "cli", "dist", "index.js");
    await writeFile(bin, '#!/usr/bin/env node\nconsole.log("ready");\n', { mode: 0o644 });
    execFileSync(process.execPath, [script]);
    if (process.platform !== "win32") {
      assert.equal((await stat(bin)).mode & 0o111, 0o111);
      assert.equal(execFileSync(bin, { encoding: "utf8" }).trim(), "ready");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
