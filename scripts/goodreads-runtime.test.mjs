import assert from "node:assert/strict";
import test from "node:test";

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
