export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "goodreads-cli/1.0.0 (+https://github.com/zaydiscold/goodreads-cli-mcp-api)",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

/**
 * Authenticated fetch for Goodreads HTML pages.
 *
 * Mirrors `fetchText` but attaches GOODREADS_COOKIE and browser-like headers
 * when the cookie env var is set, so sensitive pages (My Books, shelf
 * inventory) return signed-in content instead of the public sign-in wall.
 * Returns both the HTML text and a signed-out signal so callers can warn when
 * the cookie is missing, expired, or the session was terminated.
 */
export async function fetchAuthenticatedText(
  url: string,
): Promise<{ html: string; signedOut: boolean }> {
  const cookie = process.env.GOODREADS_COOKIE;
  const headers: Record<string, string> = {
    "user-agent": "goodreads-cli/1.0.0 (+https://github.com/zaydiscold/goodreads-cli-mcp-api)",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
  if (cookie) {
    headers.cookie = cookie;
    // Goodreads returns the sign-in wall on the /review/list pages without
    // browser-like origin headers — same lesson as write mutations (Referer
    // required).  Add them opportunistically; they are harmless on public
    // pages and unlock authenticated shelf views.
    headers.referer = "https://www.goodreads.com/";
    headers.origin = "https://www.goodreads.com";
  }

  const response = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const sample = html.slice(0, 64_000).toLowerCase();
  // Reuse the same signed-out heuristic as live.ts:
  // - the page lacks a sign-out affordance AND contains a sign-in link.
  const signedIn = /sign out|\/user\/sign_out|signout/.test(sample);
  const signedOut =
    cookie !== undefined &&
    !signedIn &&
    /sign in to goodreads|name=["']sign_in|\/user\/sign_in|amazon sign-in/.test(sample);

  return { html, signedOut };
}

export function goodreadsUrl(path: string, baseUrl = "https://www.goodreads.com"): string {
  return new URL(path, baseUrl).toString();
}
