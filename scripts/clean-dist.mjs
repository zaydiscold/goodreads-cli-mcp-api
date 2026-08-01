import { rmSync } from "node:fs";

for (const path of [
  "cli/dist",
  "mcp/dist",
  "cli/tsconfig.tsbuildinfo",
  "mcp/tsconfig.tsbuildinfo",
]) {
  rmSync(path, { recursive: true, force: true });
}
console.log("removed generated CLI/MCP artifacts");
