import {
  explainFetchFailure,
  isGoodreadsChallengeHtml,
  normalizeGoodreadsCookie,
  publicGoodreadsCookie,
} from "./cookie.js";

export const TRUSTED_GOODREADS_ORIGIN = "https://www.goodreads.com";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_GOODREADS_REDIRECTS = 5;

export function isTrustedGoodreadsUrl(url: URL): boolean {
  return url.protocol === "https:" && url.origin === TRUSTED_GOODREADS_ORIGIN;
}

export function assertTrustedGoodreadsUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`invalid Goodreads URL: ${value}`);
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

async function fetchGoodreadsResponse(url: string, init: RequestInit): Promise<Response> {
  let currentUrl = assertTrustedGoodreadsUrl(url).toString();

  for (let redirectCount = 0; ; redirectCount += 1) {
    let response: Response;
    try {
      response = await fetch(currentUrl, { ...init, redirect: "manual" });
    } catch (err) {
      throw explainFetchFailure(err, currentUrl);
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
    currentUrl = redirectUrl.toString();
  }
}

export async function fetchText(url: string): Promise<string> {
  const trustedUrl = assertTrustedGoodreadsUrl(url).toString();
  const response = await fetchGoodreadsResponse(trustedUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`GET ${trustedUrl} failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  if (isGoodreadsChallengeHtml(html)) {
    throw new Error(
      `GET ${trustedUrl} failed: Goodreads anti-bot/WAF challenge page (not real HTML). Retry with a browser-minted aws-waf-token in GOODREADS_COOKIE.`,
    );
  }
  return html;
}

/**
 * Authenticated fetch for Goodreads HTML pages.
 *
 * Uses the full normalized cookie jar (including Amazon SSO cookies on
 * `.goodreads.com`) so shelf inventory and account pages stay signed-in.
 * Public discovery endpoints that 302-loop with that jar should call
 * `fetchText` / `fetchPublicText` instead.
 */
export async function fetchAuthenticatedText(
  url: string,
): Promise<{ html: string; signedOut: boolean }> {
  const trustedUrl = assertTrustedGoodreadsUrl(url).toString();
  const cookie = normalizeGoodreadsCookie(process.env.GOODREADS_COOKIE);
  const headers: Record<string, string> = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
  if (cookie) {
    headers.cookie = cookie;
    headers.referer = `${TRUSTED_GOODREADS_ORIGIN}/`;
    headers.origin = TRUSTED_GOODREADS_ORIGIN;
  }

  const response = await fetchGoodreadsResponse(trustedUrl, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`GET ${trustedUrl} failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  if (isGoodreadsChallengeHtml(html)) {
    throw new Error(
      `GET ${trustedUrl} failed: Goodreads anti-bot/WAF challenge page. Refresh GOODREADS_COOKIE (include aws-waf-token) from a logged-in browser.`,
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

/**
 * Public Goodreads HTML fetch. Uses a search-safe cookie subset when present
 * so WAF tokens can still be sent without SSO redirect loops.
 */
export async function fetchPublicText(url: string): Promise<string> {
  const trustedUrl = assertTrustedGoodreadsUrl(url).toString();
  const cookie = publicGoodreadsCookie(process.env.GOODREADS_COOKIE);
  if (!cookie) return fetchText(trustedUrl);

  let response: Response;
  try {
    response = await fetchGoodreadsResponse(trustedUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        cookie,
        referer: `${TRUSTED_GOODREADS_ORIGIN}/`,
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    // Fall back to fully anonymous if the public jar still loops.
    try {
      return await fetchText(trustedUrl);
    } catch {
      throw explainFetchFailure(err, trustedUrl);
    }
  }

  if (!response.ok) {
    throw new Error(`GET ${trustedUrl} failed: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  if (isGoodreadsChallengeHtml(html)) {
    // last resort anonymous
    return fetchText(trustedUrl);
  }
  return html;
}

export function goodreadsUrl(path: string, baseUrl = TRUSTED_GOODREADS_ORIGIN): string {
  return new URL(path, baseUrl).toString();
}
