import type { GoodreadsRoute } from "../lib.js";

export interface LiveRequestPlan {
  execute: boolean;
  dryRun: boolean;
  routeId: string;
  method: string;
  path: string;
  url: string;
  mutatesAccount: boolean;
  requiresCookie: boolean;
  requiresCsrf: boolean;
  auth: {
    cookieEnv: "GOODREADS_COOKIE";
    csrfEnv: "GOODREADS_CSRF_TOKEN";
    cookiePresent: boolean;
    csrfPresent: boolean;
  };
  bodyMode: "none" | "json" | "form";
}

export interface LiveExecuteOptions {
  baseUrl?: string;
  pathParams?: Record<string, string>;
  query?: Record<string, string>;
  bodyJson?: unknown;
  form?: Record<string, string>;
  dryRun?: boolean;
}

function renderPath(route: GoodreadsRoute, pathParams: Record<string, string>): string {
  return route.path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = pathParams[name] ?? pathParams[name.replace(/_/g, "-")];
    if (!value) throw new Error(`missing path parameter: ${name}`);
    return encodeURIComponent(value);
  });
}

export function buildLiveRequestPlan(
  route: GoodreadsRoute,
  options: LiveExecuteOptions = {},
): LiveRequestPlan {
  const renderedPath = renderPath(route, options.pathParams ?? {});
  const url = new URL(renderedPath, options.baseUrl ?? "https://www.goodreads.com");
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }
  const hasJson = options.bodyJson !== undefined;
  const hasForm = Object.keys(options.form ?? {}).length > 0;
  if (hasJson && hasForm) throw new Error("use either --body-json or --form, not both");
  return {
    execute: !options.dryRun,
    dryRun: Boolean(options.dryRun),
    routeId: route.id,
    method: route.method,
    path: route.path,
    url: url.toString(),
    mutatesAccount: route.mutatesAccount,
    requiresCookie: route.mutatesAccount,
    requiresCsrf: route.mutatesAccount && ["POST", "PUT", "PATCH", "DELETE"].includes(route.method),
    auth: {
      cookieEnv: "GOODREADS_COOKIE",
      csrfEnv: "GOODREADS_CSRF_TOKEN",
      cookiePresent: Boolean(process.env.GOODREADS_COOKIE),
      csrfPresent: Boolean(process.env.GOODREADS_CSRF_TOKEN),
    },
    bodyMode: hasJson ? "json" : hasForm ? "form" : "none",
  };
}

export async function executeLiveRequest(
  route: GoodreadsRoute,
  options: LiveExecuteOptions = {},
): Promise<unknown> {
  const plan = buildLiveRequestPlan(route, options);
  if (options.dryRun) return plan;
  if (plan.requiresCookie && !process.env.GOODREADS_COOKIE) {
    throw new Error("GOODREADS_COOKIE is required for live Goodreads mutations");
  }
  if (plan.requiresCsrf && !process.env.GOODREADS_CSRF_TOKEN && !options.form?.authenticity_token) {
    throw new Error(
      "GOODREADS_CSRF_TOKEN or form authenticity_token is required for live Goodreads mutations",
    );
  }

  let body: BodyInit | undefined;
  const headers: Record<string, string> = {
    "user-agent": "goodreads-cli/0.1.0 (+https://github.com/zaydiscold/goodreads-cli-mcp-api)",
    accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  };
  if (process.env.GOODREADS_COOKIE) headers.cookie = process.env.GOODREADS_COOKIE;
  if (process.env.GOODREADS_CSRF_TOKEN) headers["x-csrf-token"] = process.env.GOODREADS_CSRF_TOKEN;
  if (options.bodyJson !== undefined) {
    body = JSON.stringify(options.bodyJson);
    headers["content-type"] = "application/json";
  } else if (options.form && Object.keys(options.form).length > 0) {
    const form = new URLSearchParams(options.form);
    if (process.env.GOODREADS_CSRF_TOKEN && !form.has("authenticity_token")) {
      form.set("authenticity_token", process.env.GOODREADS_CSRF_TOKEN);
    }
    body = form;
    headers["content-type"] = "application/x-www-form-urlencoded";
  }

  const response = await fetch(plan.url, { method: route.method, headers, body });
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Goodreads returned HTTP ${response.status} for ${route.method} ${route.path}`);
  }
  return {
    status: response.status,
    contentType,
    bodyShape: contentType.includes("json") ? "json" : "text",
    byteLength: text.length,
    privacy: "response body omitted by default; use browser fixtures/parsers for redacted content",
  };
}
