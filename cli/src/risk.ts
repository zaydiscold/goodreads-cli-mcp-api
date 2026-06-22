import type { GoodreadsRoute } from "./lib.js";

export type RiskLevel = "read" | "write-safe" | "write-mutate" | "write-destructive";

export function riskLevelForRoute(route: GoodreadsRoute): RiskLevel {
  if (!route.mutatesAccount) return "read";
  if (route.method === "DELETE") return "write-destructive";
  return "write-mutate";
}

export function emitLiveMutationWarning(route: GoodreadsRoute): void {
  const level = riskLevelForRoute(route);
  if (level !== "write-mutate" && level !== "write-destructive") return;
  process.stderr.write(
    `[WRITES TO LIVE GOODREADS] this will modify your Goodreads account: ${level} ${route.method} ${route.path} (${route.id})\n`,
  );
}
