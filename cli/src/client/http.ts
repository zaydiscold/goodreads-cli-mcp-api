import {
  explainFetchFailure,
  isGoodreadsChallengeHtml,
  normalizeGoodreadsCookie,
  publicGoodreadsCookie,
} from "./cookie.js";

export const TRUSTED_GOODREADS_ORIGIN = "https://www.goodreads.com";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_GOODREADS_REDIRECTS = 5;
const MAX_GOODREADS_RESPONSE_BYTES = 8 * 1024 * 1024;

export function encodeGoodreadsPathSegment(value: string, label = "path parameter"): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  if (normalized === "." || normalized === "..") {
    throw new Error(`${label} must not be a dot segment`);
  }
  return encodeURIComponent(normalized);
}

function assertSafeRawPath(path: string): void {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  const decodedSegments = pathname.split("/").map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      throw new Error("invalid percent-encoding in Goodreads path");
    }
  });
  if (decodedSegments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Goodreads paths must not contain dot segments");
  }
}

export function isTrustedGoodreadsUrl(url: URL): boolean {
  return url.protocol === "https:" && url.origin === TRUSTED_GOODREADS_ORIGIN;
}

export function assertTrustedGoodreadsUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid Goodreads URL");
  }
  if (!isTrustedGoodreadsUrl(url)) {
    throw new Error(
      `Goodreads network requests are restricted to ${TRUSTED_GOODREADS_ORIGIN} (got ${url.origin})`,
    );
  }
  if (url.username || url.password) {
    throw new Error("Goodreads URLs must not include embedded credentials");
  }
  return url;
}

export async function readBoundedResponseText(
  response: Response,
  limit = MAX_GOODREADS_RESPONSE_BYTES,
): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new Error(`Goodreads response exceeded ${limit} bytes`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error(`Goodreads response exceeded ${limit} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchGoodreadsResponse(url: string, init: RequestInit): Promise<Response> {
  let currentUrl = assertTrustedGoodreadsUrl(url).toString();

  for (let redirectCount = 0; ; redirectCount += 1) {
    let response: Response;
    try {
      response = await fetch(currentUrl, { ...init, redirect: "manual" });
    } catch (error) {
      throw explainFetchFailure(error, currentUrl);
    }

    if (!REDIRECT_STATUSES.has(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    if (redirectCount >= MAX_GOODREADS_REDIRECTS) {
      throw new Error(`GET ${url} failed: too many Goodreads redirects`);
    }

    const redirectUrl = new URL(location, currentUrl);
    if (!isTrustedGoodreadsUrl(redirectUrl)) {
      throw new Error(
        `GET ${currentUrl} failed: Goodreads returned a cross-origin redirect to ${redirectUrl.origin}; refusing it`,
      );
    }
    if (redirectUrl.username || redirectUrl.password) {
      throw new Error(
        `GET ${currentUrl} failed: Goodreads returned a redirect with embedded credentials; refusing it`,
      );
    }
    currentUrl = redirectUrl.toString();
  }
}

function browserHeaders(): Record<string, string> {
  return {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
}

export async function fetchText(url: string): Promise<string> {
  const trustedUrl = assertTrustedGoodreadsUrl(url).toString();
  const response = await fetchGoodreadsResponse(trustedUrl, {
    headers: browserHeaders(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GET ${trustedUrl} failed: ${response.status} ${response.statusText}`);
  const html = await readBoundedResponseText(response);
  if (isGoodreadsChallengeHtml(html)) {
    throw new Error(
      `GET ${trustedUrl} failed: Goodreads anti-bot/WAF challenge page. Refresh a browser-minted aws-waf-token if needed.`,
    );
  }
  return html;
}

export async function fetchAuthenticatedText(
  url: string,
): Promise<{ html: string; signedOut: boolean }> {
  const trustedUrl = assertTrustedGoodreadsUrl(url).toString();
  const cookie = normalizeGoodreadsCookie(process.env.GOODREADS_COOKIE);
  const headers = browserHeaders();
  if (cookie) {
    headers.cookie = cookie;
    headers.referer = `${TRUSTED_GOODREADS_ORIGIN}/`;
    headers.origin = TRUSTED_GOODREADS_ORIGIN;
  }
  const response = await fetchGoodreadsResponse(trustedUrl, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GET ${trustedUrl} failed: ${response.status} ${response.statusText}`);
  const html = await readBoundedResponseText(response);
  if (isGoodreadsChallengeHtml(html)) {
    throw new Error(
      `GET ${trustedUrl} failed: Goodreads anti-bot/WAF challenge page. Refresh GOODREADS_COOKIE from a logged-in browser.`,
    );
  }
  const sample = html.slice(0, 64_000).toLowerCase();
  const signedIn = /sign out|\/user\/sign_out|signout/.test(sample);
  const signedOut =
    Boolean(process.env.GOODREADS_COOKIE) &&
    !signedIn &&
    /sign in to goodreads|name=["']sign_in|\/user\/sign_in|amazon sign-in/.test(sample);
  return { html, signedOut };
}

export async function fetchPublicText(url: string): Promise<string> {
  const trustedUrl = assertTrustedGoodreadsUrl(url).toString();
  const cookie = publicGoodreadsCookie(process.env.GOODREADS_COOKIE);
  if (!cookie) return fetchText(trustedUrl);

  let response: Response;
  try {
    response = await fetchGoodreadsResponse(trustedUrl, {
      headers: {
        ...browserHeaders(),
        cookie,
        referer: `${TRUSTED_GOODREADS_ORIGIN}/`,
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/redirect|loop|too many/i.test(message)) throw error;
    return fetchText(trustedUrl);
  }

  if (!response.ok) throw new Error(`GET ${trustedUrl} failed: ${response.status} ${response.statusText}`);
  const html = await readBoundedResponseText(response);
  if (isGoodreadsChallengeHtml(html)) return fetchText(trustedUrl);
  return html;
}

export function goodreadsUrl(path: string, baseUrl = TRUSTED_GOODREADS_ORIGIN): string {
  assertSafeRawPath(path);
  const base = assertTrustedGoodreadsUrl(new URL(baseUrl).toString());
  return assertTrustedGoodreadsUrl(new URL(path, base).toString()).toString();
}
