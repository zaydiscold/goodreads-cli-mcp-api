import type { GoodreadsRoute } from "../lib.js";
import { explainFetchFailure, normalizeGoodreadsCookie } from "./cookie.js";
import {
  encodeGoodreadsPathSegment,
  fetchAuthenticatedText,
  isTrustedGoodreadsUrl,
  readBoundedResponseText,
  TRUSTED_GOODREADS_ORIGIN,
} from "./http.js";

export { TRUSTED_GOODREADS_ORIGIN } from "./http.js";

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

export const CSRF_REFRESH_URL = `${TRUSTED_GOODREADS_ORIGIN}/review/list`;
const NORMAL_RAILS_FORM_PATHS = new Set(["/review/update/{book_id}", "/quotes"]);

function responseChallenge(status: number, contentType: string, text: string) {
  const sample = text.slice(0, 64_000).toLowerCase();
  if (
    status === 202 ||
    /captcha|robot check|verify (that )?you are human|unusual traffic|cloudflare/.test(sample)
  ) {
    return "anti-bot" as const;
  }
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
    if (value === undefined) throw new Error(`missing path parameter: ${name}`);
    return encodeGoodreadsPathSegment(value, name);
  });
}

function requestBodyMode(options: LiveExecuteOptions): LiveRequestPlan["bodyMode"] {
  const hasJson = options.bodyJson !== undefined;
  const hasForm = Object.keys(options.form ?? {}).length > 0;
  if (hasJson && hasForm) throw new Error("use either bodyJson or form, not both");
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
  const base = new URL(options.baseUrl ?? TRUSTED_GOODREADS_ORIGIN);
  const url = new URL(renderedPath, base);
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
    requiresCsrf:
      route.mutatesAccount && ["POST", "PUT", "PATCH", "DELETE"].includes(route.method),
    trustedOrigin,
    auth: {
      cookieEnv: "GOODREADS_COOKIE",
      csrfEnv: "GOODREADS_CSRF_TOKEN",
      cookiePresent: Boolean(process.env.GOODREADS_COOKIE),
      csrfPresent: Boolean(
        process.env.GOODREADS_CSRF_TOKEN || options.form?.authenticity_token,
      ),
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
    throw new Error("GOODREADS_COOKIE is required for live Goodreads requests");
  }
  if (
    plan.requiresCsrf &&
    !process.env.GOODREADS_CSRF_TOKEN &&
    !options.form?.authenticity_token &&
    !process.env.GOODREADS_COOKIE
  ) {
    throw new Error(
      "GOODREADS_COOKIE or an explicit CSRF token is required for live Goodreads mutations",
    );
  }
}

export function extractCsrfToken(html: string): string | null {
  const meta =
    html.match(/name=["']csrf-token["']\s+content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["']\s+name=["']csrf-token["']/i);
  if (meta?.[1]) return meta[1];
  return html.match(/name=["']authenticity_token["'][^>]*value=["']([^"']+)["']/i)?.[1] ?? null;
}

/** Select a CSRF token for this request without mutating process.env. */
export async function ensureFreshCsrf(
  plan: LiveRequestPlan,
  options: LiveExecuteOptions = {},
): Promise<string | null> {
  if (!plan.requiresCsrf) return process.env.GOODREADS_CSRF_TOKEN ?? null;
  if (options.form?.authenticity_token) return options.form.authenticity_token;
  if (process.env.GOODREADS_SKIP_CSRF_REFRESH === "1") {
    return process.env.GOODREADS_CSRF_TOKEN ?? null;
  }
  if (!normalizeGoodreadsCookie(process.env.GOODREADS_COOKIE)) {
    return process.env.GOODREADS_CSRF_TOKEN ?? null;
  }

  const { html, signedOut } = await fetchAuthenticatedText(CSRF_REFRESH_URL);
  if (signedOut) {
    throw new Error(
      "Goodreads cookie session is not signed in; re-extract GOODREADS_COOKIE from a logged-in browser",
    );
  }
  const token = extractCsrfToken(html);
  if (token) return token;
  if (process.env.GOODREADS_CSRF_TOKEN) return process.env.GOODREADS_CSRF_TOKEN;
  throw new Error("Could not extract a Goodreads CSRF token from the authenticated session");
}

function requestHeaders(plan: LiveRequestPlan, csrfToken: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  };
  if (plan.requiresCookie && process.env.GOODREADS_COOKIE) {
    headers.cookie = normalizeGoodreadsCookie(process.env.GOODREADS_COOKIE);
  }
  if (plan.requiresCsrf && csrfToken) headers["x-csrf-token"] = csrfToken;
  if (plan.mutatesAccount) {
    headers.referer = `${TRUSTED_GOODREADS_ORIGIN}/`;
    headers.origin = TRUSTED_GOODREADS_ORIGIN;
    if (!NORMAL_RAILS_FORM_PATHS.has(plan.path)) {
      headers["x-requested-with"] = "XMLHttpRequest";
    }
  }
  return headers;
}

function requestBody(
  plan: LiveRequestPlan,
  options: LiveExecuteOptions,
  headers: Record<string, string>,
  csrfToken: string | null,
): BodyInit | undefined {
  if (options.bodyJson !== undefined) {
    headers["content-type"] = "application/json";
    return JSON.stringify(options.bodyJson);
  }
  if (!options.form || Object.keys(options.form).length === 0) return undefined;
  const form = new URLSearchParams(options.form);
  if (plan.requiresCsrf && csrfToken && !form.has("authenticity_token")) {
    form.set("authenticity_token", csrfToken);
  }
  headers["content-type"] = "application/x-www-form-urlencoded";
  return form;
}

function validateRedirect(response: Response, plan: LiveRequestPlan): string | null {
  const location = response.headers.get("location");
  if (!location) return null;
  const redirectUrl = new URL(location, plan.url);
  if (!isTrustedGoodreadsUrl(redirectUrl)) {
    throw new Error(
      `Goodreads returned a cross-origin redirect to ${redirectUrl.origin}; refusing it`,
    );
  }
  if (redirectUrl.username || redirectUrl.password) {
    throw new Error("Goodreads returned a redirect with embedded credentials; refusing it");
  }
  return location;
}

async function summarizeResponse(
  response: Response,
  route: GoodreadsRoute,
  plan: LiveRequestPlan,
): Promise<LiveRequestResult> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await readBoundedResponseText(response);
  const redirected = response.status >= 300 && response.status < 400;
  if (!response.ok && !redirected) {
    throw new Error(
      `Goodreads returned HTTP ${response.status} for ${route.method} ${route.path}; response body omitted`,
    );
  }
  const redirectLocation = validateRedirect(response, plan);
  const redirectPath = redirectLocation ? new URL(redirectLocation, plan.url).pathname : null;
  const challenge =
    redirectPath && /\/user\/(?:sign_in|new)/.test(redirectPath)
      ? ("authentication" as const)
      : responseChallenge(response.status, contentType, text);
  return {
    status: response.status,
    contentType,
    bodyShape: contentType.includes("json") ? "json" : "text",
    byteLength: Buffer.byteLength(text),
    requestAccepted: (response.ok || redirected) && challenge === null,
    mutationVerified: false,
    redirected,
    redirectLocation,
    challenge,
    privacy: "response body omitted; use redacted parsers for semantic readback",
  };
}

export async function executeLiveRequest(
  route: GoodreadsRoute,
  options: LiveExecuteOptions = {},
): Promise<LiveRequestPlan | LiveRequestResult> {
  const plan = buildLiveRequestPlan(route, options);
  if (plan.dryRun) return plan;
  assertCredentialBoundary(plan, options);
  const csrfToken = await ensureFreshCsrf(plan, options);
  if (plan.requiresCsrf && !csrfToken) {
    throw new Error("A Goodreads CSRF token is required for this live mutation");
  }
  const headers = requestHeaders(plan, csrfToken);
  const body = requestBody(plan, options, headers, csrfToken);

  let response: Response;
  try {
    response = await fetch(plan.url, {
      method: route.method,
      headers,
      body,
      redirect: plan.requiresCookie ? "manual" : "follow",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw explainFetchFailure(error, plan.url);
  }
  return summarizeResponse(response, route, plan);
}
