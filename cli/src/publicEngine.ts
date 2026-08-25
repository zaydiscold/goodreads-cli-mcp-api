export * from "./engine.js";

import { findRoute, type Envelope } from "./engine.js";
import {
  buildLiveRequestPlan,
  executeLiveRequest,
  type LiveExecuteOptions,
} from "./client/live.js";
import { envelope } from "./lib.js";
import { emitLiveMutationWarning, riskLevelForRoute } from "./risk.js";

/**
 * Public generic executor contract.
 *
 * An explicit dry-run is always side-effect-free and therefore does not need
 * live-only environment or route approvals. Authorization is checked only
 * after request planning proves that a mutation will actually be sent.
 */
export async function requestExecute(options: {
  routeSelector: string;
  baseUrl?: string;
  pathParams?: Record<string, string>;
  query?: Record<string, string>;
  bodyJson?: unknown;
  form?: Record<string, string>;
  authenticated?: boolean;
  approvedRoute?: string;
  execute?: boolean;
  dryRun?: boolean;
}): Promise<Envelope> {
  const route = await findRoute(options.routeSelector);
  const executeOptions: LiveExecuteOptions = {
    baseUrl: options.baseUrl ?? "https://www.goodreads.com",
    pathParams: options.pathParams ?? {},
    query: options.query ?? {},
    bodyJson: options.bodyJson,
    form: options.form ?? {},
    authenticated: options.authenticated,
    execute: options.execute,
    dryRun: options.dryRun,
  };
  const plan = buildLiveRequestPlan(route, executeOptions);
  if (plan.dryRun) {
    return envelope({ ...plan, riskLevel: riskLevelForRoute(route), outcome: "planned" });
  }

  if (route.mutatesAccount) {
    const exactRoute = `${route.method} ${route.path}`;
    if (process.env.GOODREADS_ALLOW_GENERIC_WRITES !== "1") {
      throw new Error("live generic mutations require GOODREADS_ALLOW_GENERIC_WRITES=1");
    }
    if (options.approvedRoute !== exactRoute && options.approvedRoute !== route.id) {
      throw new Error(
        `live mutation requires approvedRoute to exactly equal '${exactRoute}' or '${route.id}'`,
      );
    }
  }

  emitLiveMutationWarning(route);
  return envelope(await executeLiveRequest(route, executeOptions));
}
