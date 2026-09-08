import { chmod, cp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = join(here, "..");
const repoRoot = join(cliRoot, "..");
const source = join(repoRoot, "api-map");
const target = join(cliRoot, "dist", "api-map");

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
await chmod(join(cliRoot, "dist", "index.js"), 0o755);
