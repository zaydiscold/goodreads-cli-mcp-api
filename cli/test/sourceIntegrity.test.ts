import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../../scripts/source-integrity.mjs", import.meta.url));

function run(files: Record<string, string>, manifest: unknown) {
  const root = mkdtempSync(join(tmpdir(), "source-integrity-"));
  try {
    for (const [path, text] of Object.entries(files)) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
    writeFileSync(join(root, "source-integrity.json"), JSON.stringify(manifest));
    return spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("source integrity guard", () => {
  it("accepts a small refactored module that preserves its declared source contract", () => {
    const result = run(
      { "src/core.ts": "export const registry = [];\nexport function run() {}\n" },
      {
        files: {
          "src/core.ts": {
            requiredSubstrings: ["export const registry", "export function run"],
          },
        },
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("source integrity ok");
  });

  it("rejects a file that lost a required source sentinel", () => {
    const result = run(
      { "src/core.ts": "export const registry = [];\n" },
      {
        files: {
          "src/core.ts": {
            requiredSubstrings: ["export const registry", "export function run"],
          },
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("SOURCE INTEGRITY FAILURE");
    expect(result.stderr).toContain("export function run");
  });

  it("rejects missing critical files and empty manifest contracts", () => {
    const missing = run(
      {},
      {
        files: {
          "src/core.ts": { requiredSubstrings: ["export function run"] },
        },
      },
    );
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("missing");

    const emptyContract = run(
      { "src/core.ts": "export function run() {}\n" },
      { files: { "src/core.ts": { requiredSubstrings: [] } } },
    );
    expect(emptyContract.status).not.toBe(0);
    expect(emptyContract.stderr).toContain("has no requiredSubstrings");
  });

  it("rejects manifest paths that escape the repository root", () => {
    const result = run(
      {},
      {
        files: {
          "../outside.ts": { requiredSubstrings: ["secret"] },
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("resolves outside repository root");
  });
});
