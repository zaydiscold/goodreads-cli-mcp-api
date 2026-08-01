import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const script = fileURLToPath(new URL("./source-integrity.mjs", import.meta.url));

function run(files, manifest) {
  const root = mkdtempSync(join(tmpdir(), "source-integrity-"));
  try {
    for (const [path, text] of Object.entries(files)) {
      const target = join(root, path);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, text);
    }
    writeFileSync(join(root, "source-integrity.json"), JSON.stringify(manifest));
    return spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("accepts source files above the declared floors", () => {
  const result = run(
    { "src/core.ts": "a\nb\nc\n" },
    { files: { "src/core.ts": { minLines: 3, minBytes: 5 } } },
  );
  assert.equal(result.status, 0, result.stderr);
});

test("blocks catastrophic source truncation", () => {
  const result = run(
    { "src/core.ts": "a\n" },
    { files: { "src/core.ts": { minLines: 3, minBytes: 5 } } },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SOURCE INTEGRITY FAILURE/);
});

test("blocks a missing critical source file", () => {
  const result = run({}, { files: { "src/core.ts": { minLines: 3, minBytes: 5 } } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing/);
});
