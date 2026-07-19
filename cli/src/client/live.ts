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
  trustedOrigin: boolean;
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
  authenticated?: boolean;
  execute?: boolean;
  dryRun?: boolean;
}

export interface LiveRequestResult {
  status: number;
  contentType: string;
  bodyShape: "json" | "text";
  byteLength: number;
  requestAccepted: boolean;
  mutationVerified: false;
  redirected: boolean;
  redirectLocation: string | null;
  challenge: "anti-bot" | "authentication" | null;
  privacy: string;
}

export const TRUSTED_GOODREADS_ORIGIN = "https://www.goodreads.com";

function isTrustedGoodreadsUrl(url: URL): boolean {
  return url.protocol === "https:" && url.origin === TRUSTED_GOODREADS_ORIGIN;
}

function responseChallenge(status: number, contentType: string, text: string) {
  const sample = text.slice(0, 64_000).toLowerCase();
  if (
    status === 202 ||
    /captcha|robot check|verify (that )?you are human|unusual traffic|cloudflare/.test(sample)
  ) {
    return "anti-bot" as const;
  }
  // Every Goodreads page, signed in or not, links /user/sign_in in its nav
  // markup; only a session without a sign-out affordance is actually facing
  // an authentication wall.
  const signedIn = /sign out|\/user\/sign_out|signout/.test(sample);
  if (
    !signedIn &&
    /sign in to goodreads|name=["']sign_in|\/user\/sign_in|amazon sign-in/.test(sample)
  ) {
    return "authentication" as const;
  }
  if (contentType.includes("json")) return null;
  return null;
}

function renderPath(route: GoodreadsRoute, pathParams: Record<string, string>): string {
  return route.path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = pathParams[name] ?? pathParams[name.replace(/_/g, "-")];
    if (!value) throw new Error(`missing path parameter: ${name}`);
    return encodeURIComponent(value);
  });
}

function requestBodyMode(options: LiveExecuteOptions): LiveRequestPlan["bodyMode"] {
  const hasJson = options.bodyJson !== undefined;
  const hasForm = Object.keys(options.form ?? {}).length > 0;
  if (hasJson && hasForm) throw new Error("use either --body-json or --form, not both");
  if (hasJson) return "json";
  if (hasForm) return "form";
  return "none";
}

function shouldDryRun(route: GoodreadsRoute, options: LiveExecuteOptions): boolean {
  if (options.dryRun) return true;
  return route.mutatesAccount && !options.execute;
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
  const trustedOrigin = isTrustedGoodreadsUrl(url);
  const dryRun = shouldDryRun(route, options);
  return {
    execute: !dryRun,
    dryRun,
    routeId: route.id,
    method: route.method,
    path: route.path,
    url: url.toString(),
    mutatesAccount: route.mutatesAccount,
    requiresCookie: route.mutatesAccount || Boolean(options.authenticated),
    requiresCsrf: route.mutatesAccount && ["POST", "PUT", "PATCH", "DELETE"].includes(route.method),
    trustedOrigin,
    auth: {
      cookieEnv: "GOODREADS_COOKIE",
      csrfEnv: "GOODREADS_CSRF_TOKEN",
      cookiePresent: Boolean(process.env.GOODREADS_COOKIE),
      csrfPresent: Boolean(process.env.GOODREADS_CSRF_TOKEN),
    },
    bodyMode: requestBodyMode(options),
  };
}

function assertCredentialBoundary(plan: LiveRequestPlan, options: LiveExecuteOptions): void {
  if (plan.requiresCookie && !plan.trustedOrigin) {
    throw new Error(
      `credentialed Goodreads requests are restricted to ${TRUSTED_GOODREADS_ORIGIN}`,
    );
  }
  if (plan.requiresCookie && !process.env.GOODREADS_COOKIE) {
    throw new Error("GOODREADS_COOKIE is required for live Goodreads mutations");
  }
  if (plan.requiresCsrf && !process.env.GOODREADS_CSRF_TOKEN && !options.form?.authenticity_token) {
    throw new Error(
      "GOODREADS_CSRF_TOKEN or form authenticity_token is required for live Goodreads mutations",
    );
  }
}

function requestHeaders(plan: LiveRequestPlan): Record<string, string> {
  const headers: Record<string, string> = {
    "user-agent": "goodreads-cli/1.0.0 (+https://github.com/zaydiscold/goodreads-cli-mcp-api)",
    accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  };
  if (plan.requiresCookie && process.env.GOODREADS_COOKIE) {
    headers.cookie = process.env.GOODREADS_COOKIE;
  }
  if (plan.requiresCsrf && process.env.GOODREADS_CSRF_TOKEN) {
    headers["x-csrf-token"] = process.env.GOODREADS_CSRF_TOKEN;
  }
  return headers;
}

function requestBody(
  plan: LiveRequestPlan,
  options: LiveExecuteOptions,
  headers: Record<string, string>,
): BodyInit | undefined {
  if (options.bodyJson !== undefined) {
    headers["content-type"] = "application/json";
    return JSON.stringify(options.bodyJson);
  }
  if (!options.form || Object.keys(options.form).length === 0) return undefined;

  const form = new URLSearchParams(options.form);
  if (plan.requiresCsrf && process.env.GOODREADS_CSRF_TOKEN && !form.has("authenticity_token")) {
    form.set("authenticity_token", process.env.GOODREADS_CSRF_TOKEN);
  }
  headers["content-type"] = "application/x-www-form-urlencoded";
  return form;
}

function validateRedirect(response: Response, plan: LiveRequestPlan): string | null {
  const redirectLocation = response.headers.get("location");
  if (!redirectLocation) return null;
  const redirectUrl = new URL(redirectLocation, plan.url);
  if (!isTrustedGoodreadsUrl(redirectUrl)) {
    throw new Error(
      `Goodreads returned a cross-origin redirect to ${redirectUrl.origin}; refusing it`,
    );
  }
  return redirectLocation;
}

async function summarizeResponse(
  response: Response,
  route: GoodreadsRoute,
  plan: LiveRequestPlan,
): Promise<LiveRequestResult> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  const redirected = response.status >= 300 && response.status < 400;
  if (!response.ok && !redirected) {
    throw new Error(`Goodreads returned HTTP ${response.status} for ${route.method} ${route.path}`);
  }
  const redirectLocation = validateRedirect(response, plan);
  const challenge = responseChallenge(response.status, contentType, text);
  return {
    status: response.status,
    contentType,
    bodyShape: contentType.includes("json") ? "json" : "text",
    byteLength: text.length,
    requestAccepted: response.ok && challenge === null,
    mutationVerified: false,
    redirected,
    redirectLocation,
    challenge,
    privacy: "response body omitted by default; use browser fixtures/parsers for redacted content",
  };
}

export async function executeLiveRequest(
  route: GoodreadsRoute,
  options: LiveExecuteOptions = {},
): Promise<LiveRequestPlan | LiveRequestResult> {
  const plan = buildLiveRequestPlan(route, options);
  if (plan.dryRun) return plan;
  assertCredentialBoundary(plan, options);
  const headers = requestHeaders(plan);
  const body = requestBody(plan, options, headers);

  const response = await fetch(plan.url, {
    method: route.method,
    headers,
    body,
    redirect: plan.requiresCookie ? "manual" : "follow",
    signal: AbortSignal.timeout(30_000),
  });
  return summarizeResponse(response, route, plan);
}
