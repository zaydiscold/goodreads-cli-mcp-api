import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const rootArg = process.argv.indexOf("--root");
const root = resolve(rootArg >= 0 ? process.argv[rootArg + 1] : process.cwd());
const manifestPath = resolve(root, "source-integrity.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const failures = [];

for (const [relativePath, floor] of Object.entries(manifest.files ?? {})) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) {
    failures.push(`${relativePath}: missing`);
    continue;
  }
  const text = readFileSync(path, "utf8");
  const lines = text.length === 0 ? 0 : text.split(/\r?\n/).length - (text.endsWith("\n") ? 1 : 0);
  const bytes = statSync(path).size;
  if (lines < floor.minLines) failures.push(`${relativePath}: ${lines} lines < ${floor.minLines}`);
  if (bytes < floor.minBytes) failures.push(`${relativePath}: ${bytes} bytes < ${floor.minBytes}`);
}

if (failures.length) {
  console.error("SOURCE INTEGRITY FAILURE");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`source integrity ok: ${Object.keys(manifest.files ?? {}).length} critical files`);
