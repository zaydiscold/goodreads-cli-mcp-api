/**
 * Goodreads cookie hygiene.
 *
 * Browser CDP dumps mix host-scoped cookies and often duplicate names.
 * Two separate failure modes:
 *
 * 1) Amazon SSO cookies on `.goodreads.com` (`at-main`, `session-token`, …)
 *    are required for signed-in shelf writes. Stripping them makes the CLI
 *    look logged-out (`POST /shelf/add_to_shelf` → 403 `/user/new`).
 *
 * 2) Sending that full signed-in jar to public search (`/search`) can 302
 *    to the same URL forever → undici `fetch failed` / redirect count
 *    exceeded.
 *
 * So we:
 * - always dedupe cookie names (last value wins)
 * - keep the full jar for authenticated calls
 * - expose a public-safe jar (SSO cookies removed) for anonymous pages
 * - map opaque undici errors into actionable messages
 */

/** Amazon retail/SSO cookie names that break Goodreads /search with a 302 loop. */
export const SEARCH_UNSAFE_COOKIE_NAMES = new Set([
  "at-main",
  "sess-at-main",
  "sst-main",
  "ubid-main",
  "x-main",
  "session-id",
  "session-id-time",
  "session-token",
  "lc-main",
  "csm-hit",
  "wl_download_app",
  "i18n-prefs",
  "skin",
]);

/** @deprecated alias — historical name from the first redirect-loop fix */
export const AMAZON_POISON_COOKIE_NAMES = SEARCH_UNSAFE_COOKIE_NAMES;

function parseCookieMap(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of raw.split(";")) {
    const piece = part.trim();
    if (!piece) continue;
    const eq = piece.indexOf("=");
    if (eq <= 0) continue;
    const name = piece.slice(0, eq).trim();
    if (!name) continue;
    map.set(name, piece.slice(eq + 1));
  }
  return map;
}

/**
 * Dedupe cookie names (last wins). Keeps Amazon SSO cookies — required for
 * signed-in Goodreads mutations.
 */
export function normalizeGoodreadsCookie(raw: string | undefined | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const map = parseCookieMap(trimmed);
  // Unit tests / harnesses sometimes pass a single opaque token without '='.
  if (map.size === 0) return trimmed;
  return Array.from(map.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

/**
 * Cookie jar safe for public Goodreads pages like /search.
 * Drops SSO cookies that trigger same-URL 302 loops while keeping
 * `_session_id2` / `jwt_token` / `aws-waf-token` when present.
 */
export function publicGoodreadsCookie(raw: string | undefined | null): string {
  const normalized = normalizeGoodreadsCookie(raw);
  if (!normalized) return "";
  const map = parseCookieMap(normalized);
  if (map.size === 0) return normalized;
  const kept: string[] = [];
  for (const [name, value] of map) {
    if (SEARCH_UNSAFE_COOKIE_NAMES.has(name)) continue;
    kept.push(`${name}=${value}`);
  }
  return kept.join("; ");
}

export function explainFetchFailure(err: unknown, url: string): Error {
  const anyErr = err as { message?: string; cause?: { message?: string; code?: string } };
  const causeMsg = anyErr?.cause?.message ?? "";
  const msg = anyErr?.message ?? String(err);
  if (/redirect count exceeded/i.test(causeMsg) || /redirect count exceeded/i.test(msg)) {
    return new Error(
      `GET ${url} failed: redirect loop. Public Goodreads pages must not send Amazon SSO cookies ` +
        `(at-main/session-token/…). Use publicGoodreadsCookie() for /search, full jar for writes.`,
    );
  }
  if (msg === "fetch failed" && causeMsg) {
    return new Error(`GET ${url} failed: ${causeMsg}`);
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/** Detect AWS WAF / bot interstitial HTML that is not a real Goodreads page. */
export function isGoodreadsChallengeHtml(html: string): boolean {
  const sample = html.slice(0, 8_000).toLowerCase();
  if (html.length < 5_000 && /gokuprops|awswaf|captcha|security verification/.test(sample)) {
    return true;
  }
  return /perform(ing)? security verification|challenge-platform|cdn-cgi\/challenge/.test(sample);
}
