import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

function fixtureRoot(): string {
  return realpathSync(resolve(process.env.GOODREADS_MCP_FIXTURE_ROOT || process.cwd()));
}

export function resolveMcpFixture(value: string): string {
  const root = fixtureRoot();
  const requested = value.trim();
  if (!requested) throw new Error("MCP fixture path is required");
  const candidate = realpathSync(
    isAbsolute(requested) ? requested : resolve(root, requested),
  );
  if (process.env.GOODREADS_MCP_ALLOW_ARBITRARY_FIXTURES === "1") return candidate;
  const rel = relative(root, candidate);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return candidate;
  throw new Error(
    "MCP fixture access is restricted to GOODREADS_MCP_FIXTURE_ROOT; configure the root for owned Goodreads fixtures",
  );
}

export function resolveOptionalMcpFixture(value: string | undefined): string | undefined {
  return value ? resolveMcpFixture(value) : undefined;
}
