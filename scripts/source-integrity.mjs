import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const rootArg = process.argv.indexOf("--root");
const root = resolve(rootArg >= 0 ? process.argv[rootArg + 1] : process.cwd());
const manifestPath = resolve(root, "source-integrity.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const failures = [];

function isInsideRoot(path) {
  const relativePath = relative(root, path);
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

for (const [relativePath, rule] of Object.entries(manifest.files ?? {})) {
  const path = resolve(root, relativePath);
  if (!isInsideRoot(path)) {
    failures.push(`${relativePath}: resolves outside repository root`);
    continue;
  }
  if (!existsSync(path) || !statSync(path).isFile()) {
    failures.push(`${relativePath}: missing`);
    continue;
  }

  const requiredSubstrings = Array.isArray(rule.requiredSubstrings)
    ? rule.requiredSubstrings.filter((value) => typeof value === "string" && value.length > 0)
    : [];
  if (requiredSubstrings.length === 0) {
    failures.push(`${relativePath}: manifest entry has no requiredSubstrings`);
    continue;
  }

  const text = readFileSync(path, "utf8");
  for (const required of requiredSubstrings) {
    if (!text.includes(required)) {
      failures.push(`${relativePath}: missing required source sentinel ${JSON.stringify(required)}`);
    }
  }
}

if (failures.length) {
  console.error("SOURCE INTEGRITY FAILURE");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`source integrity ok: ${Object.keys(manifest.files ?? {}).length} critical files`);
