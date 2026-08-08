import {
  explainFetchFailure,
  isGoodreadsChallengeHtml,
  normalizeGoodreadsCookie,
  publicGoodreadsCookie,
} from "./cookie.js";

export async function fetchText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw explainFetchFailure(err, url);
  }

  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  if (isGoodreadsChallengeHtml(html)) {
    throw new Error(
      `GET ${url} failed: Goodreads anti-bot/WAF challenge page (not real HTML). Retry with a browser-minted aws-waf-token in GOODREADS_COOKIE.`,
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
  const cookie = normalizeGoodreadsCookie(process.env.GOODREADS_COOKIE);
  const headers: Record<string, string> = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
  if (cookie) {
    headers.cookie = cookie;
    headers.referer = "https://www.goodreads.com/";
    headers.origin = "https://www.goodreads.com";
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw explainFetchFailure(err, url);
  }

  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  if (isGoodreadsChallengeHtml(html)) {
    throw new Error(
      `GET ${url} failed: Goodreads anti-bot/WAF challenge page. Refresh GOODREADS_COOKIE (include aws-waf-token) from a logged-in browser.`,
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
  const cookie = publicGoodreadsCookie(process.env.GOODREADS_COOKIE);
  if (!cookie) return fetchText(url);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        cookie,
        referer: "https://www.goodreads.com/",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    // Fall back to fully anonymous if the public jar still loops.
    try {
      return await fetchText(url);
    } catch {
      throw explainFetchFailure(err, url);
    }
  }

  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  if (isGoodreadsChallengeHtml(html)) {
    // last resort anonymous
    return fetchText(url);
  }
  return html;
}

export function goodreadsUrl(path: string, baseUrl = "https://www.goodreads.com"): string {
  return new URL(path, baseUrl).toString();
}
