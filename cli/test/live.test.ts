import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLiveRequestPlan,
  executeLiveRequest,
  extractCsrfToken,
} from "../src/client/live.js";
import { requestExecute } from "../src/engine.js";
import type { GoodreadsRoute } from "../src/lib.js";

const readRoute: GoodreadsRoute = {
  id: "get-book-show-book-slug",
  method: "GET",
  path: "/book/show/{book_slug}",
  tags: ["books"],
  summary: "Read a book",
  description: null,
  parameters: [],
  mutatesAccount: false,
  requiresApproval: false,
};

const mutationRoute: GoodreadsRoute = {
  id: "put-notes-book-id-share",
  method: "PUT",
  path: "/notes/{book_id}/share",
  tags: ["notes"],
  summary: "Share notes",
  description: null,
  parameters: [],
  mutatesAccount: true,
  requiresApproval: true,
};

const unauthenticatedPostRoute: GoodreadsRoute = {
  id: "post-notifications-track",
  method: "POST",
  path: "/notifications/track",
  tags: ["analytics"],
  summary: "Track a notification event",
  description: null,
  parameters: [],
  mutatesAccount: false,
  requiresApproval: false,
};

const originalCookie = process.env.GOODREADS_COOKIE;
const originalCsrf = process.env.GOODREADS_CSRF_TOKEN;
const originalGenericGate = process.env.GOODREADS_ALLOW_GENERIC_WRITES;
const originalSkipRefresh = process.env.GOODREADS_SKIP_CSRF_REFRESH;

beforeEach(() => {
  // Unit tests stub a single fetch; production always refreshes CSRF from cookie.
  process.env.GOODREADS_SKIP_CSRF_REFRESH = "1";
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalCookie === undefined) delete process.env.GOODREADS_COOKIE;
  else process.env.GOODREADS_COOKIE = originalCookie;
  if (originalCsrf === undefined) delete process.env.GOODREADS_CSRF_TOKEN;
  else process.env.GOODREADS_CSRF_TOKEN = originalCsrf;
  if (originalGenericGate === undefined) delete process.env.GOODREADS_ALLOW_GENERIC_WRITES;
  else process.env.GOODREADS_ALLOW_GENERIC_WRITES = originalGenericGate;
  if (originalSkipRefresh === undefined) delete process.env.GOODREADS_SKIP_CSRF_REFRESH;
  else process.env.GOODREADS_SKIP_CSRF_REFRESH = originalSkipRefresh;
});

describe("live request safety", () => {
  it("keeps reads live but defaults mutations to dry-run", () => {
    expect(
      buildLiveRequestPlan(readRoute, { pathParams: { book_slug: "123-example" } }),
    ).toMatchObject({ execute: true, dryRun: false });
    expect(buildLiveRequestPlan(mutationRoute, { pathParams: { book_id: "123" } })).toMatchObject({
      execute: false,
      dryRun: true,
    });
  });

  it("never forwards Goodreads credentials to an untrusted origin", async () => {
    process.env.GOODREADS_COOKIE = "secret-cookie";
    process.env.GOODREADS_CSRF_TOKEN = "secret-csrf";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      executeLiveRequest(mutationRoute, {
        baseUrl: "https://attacker.invalid",
        pathParams: { book_id: "123" },
        form: { visible: "true" },
        execute: true,
      }),
    ).rejects.toThrow("restricted to https://www.goodreads.com");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("omits credentials for unauthenticated custom-origin reads", async () => {
    process.env.GOODREADS_COOKIE = "secret-cookie";
    process.env.GOODREADS_CSRF_TOKEN = "secret-csrf";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await executeLiveRequest(readRoute, {
      baseUrl: "https://fixtures.invalid",
      pathParams: { book_slug: "123-example" },
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).not.toHaveProperty("cookie");
    expect(init.headers).not.toHaveProperty("x-csrf-token");
  });

  it("does not inject CSRF into an unauthenticated custom-origin form", async () => {
    process.env.GOODREADS_COOKIE = "secret-cookie";
    process.env.GOODREADS_CSRF_TOKEN = "secret-csrf";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await executeLiveRequest(unauthenticatedPostRoute, {
      baseUrl: "https://fixtures.invalid",
      form: { event: "opened" },
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = init.body as URLSearchParams;
    expect(init.headers).not.toHaveProperty("cookie");
    expect(init.headers).not.toHaveProperty("x-csrf-token");
    expect(body.get("event")).toBe("opened");
    expect(body.has("authenticity_token")).toBe(false);
  });

  it("sends browser-like origin headers on live mutations", async () => {
    process.env.GOODREADS_COOKIE = "secret-cookie";
    process.env.GOODREADS_CSRF_TOKEN = "secret-csrf";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await executeLiveRequest(mutationRoute, {
      pathParams: { book_id: "123" },
      form: { visible: "true" },
      execute: true,
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.referer).toBe("https://www.goodreads.com/");
    expect(headers.origin).toBe("https://www.goodreads.com");
    expect(headers["x-requested-with"]).toBe("XMLHttpRequest");
    expect(headers.cookie).toBe("secret-cookie");
    expect(headers["x-csrf-token"]).toBe("secret-csrf");
    const body = init.body as URLSearchParams;
    expect(body.get("authenticity_token")).toBe("secret-csrf");
  });

  it("does not report a 202 anti-bot page as an accepted mutation", async () => {
    process.env.GOODREADS_COOKIE = "secret-cookie";
    process.env.GOODREADS_CSRF_TOKEN = "secret-csrf";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>Robot check</html>", {
          status: 202,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    const result = await executeLiveRequest(mutationRoute, {
      pathParams: { book_id: "123" },
      form: { visible: "true" },
      execute: true,
    });
    expect(result).toMatchObject({
      requestAccepted: false,
      mutationVerified: false,
      challenge: "anti-bot",
    });
  });

  it("does not flag a signed-in page as an authentication challenge", async () => {
    process.env.GOODREADS_COOKIE = "secret-cookie";
    process.env.GOODREADS_CSRF_TOKEN = "secret-csrf";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          '<html><a href="/user/sign_out">Sign Out</a><a href="/user/sign_in">Sign In</a>notes</html>',
          { status: 200, headers: { "content-type": "text/html" } },
        ),
      ),
    );

    const result = await executeLiveRequest(mutationRoute, {
      pathParams: { book_id: "123" },
      form: { visible: "true" },
      execute: true,
    });
    expect(result).toMatchObject({ requestAccepted: true, challenge: null });
  });

  it("flags a signed-out wall as an authentication challenge", async () => {
    process.env.GOODREADS_COOKIE = "secret-cookie";
    process.env.GOODREADS_CSRF_TOKEN = "secret-csrf";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('<html>Sign in to Goodreads<a href="/user/sign_in">Sign In</a></html>', {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    const result = await executeLiveRequest(mutationRoute, {
      pathParams: { book_id: "123" },
      form: { visible: "true" },
      execute: true,
    });
    expect(result).toMatchObject({ requestAccepted: false, challenge: "authentication" });
  });

  it("refuses a cross-origin redirect without following it", async () => {
    process.env.GOODREADS_COOKIE = "secret-cookie";
    process.env.GOODREADS_CSRF_TOKEN = "secret-csrf";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "https://attacker.invalid/capture" },
        }),
      ),
    );

    await expect(
      executeLiveRequest(mutationRoute, {
        pathParams: { book_id: "123" },
        form: { visible: "true" },
        execute: true,
      }),
    ).rejects.toThrow("cross-origin redirect");
  });

  it("requires the generic write gate and exact route approval", async () => {
    delete process.env.GOODREADS_ALLOW_GENERIC_WRITES;
    await expect(
      requestExecute({
        routeSelector: "PUT /notes/{book_id}/share",
        pathParams: { book_id: "123" },
        execute: true,
        approvedRoute: "PUT /notes/{book_id}/share",
      }),
    ).rejects.toThrow("GOODREADS_ALLOW_GENERIC_WRITES=1");

    process.env.GOODREADS_ALLOW_GENERIC_WRITES = "1";
    await expect(
      requestExecute({
        routeSelector: "PUT /notes/{book_id}/share",
        pathParams: { book_id: "123" },
        execute: true,
        approvedRoute: "POST /quotes",
      }),
    ).rejects.toThrow("approvedRoute to exactly equal");
  });
});

describe("csrf refresh from the same cookie session", () => {
  it("extracts csrf-token meta and authenticity_token inputs", () => {
    expect(
      extractCsrfToken('<meta name="csrf-token" content="abc123token" />'),
    ).toBe("abc123token");
    expect(
      extractCsrfToken('<input name="authenticity_token" value="form-token-xyz" />'),
    ).toBe("form-token-xyz");
    expect(extractCsrfToken("<html>nope</html>")).toBeNull();
  });

  it("mints a fresh CSRF from the cookie session before writes", async () => {
    delete process.env.GOODREADS_SKIP_CSRF_REFRESH;
    process.env.GOODREADS_COOKIE = "session-cookie";
    delete process.env.GOODREADS_CSRF_TOKEN;

    const signedInHtml =
      '<html><meta name="csrf-token" content="fresh-from-cookie" /><a href="/user/sign_out">Sign Out</a></html>';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(signedInHtml, { status: 200, headers: { "content-type": "text/html" } }),
      )
      .mockResolvedValueOnce(
        new Response('{"ok":true}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await executeLiveRequest(mutationRoute, {
      pathParams: { book_id: "123" },
      form: { visible: "true" },
      execute: true,
    });
    // first call = csrf refresh GET, second = mutation
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(process.env.GOODREADS_CSRF_TOKEN).toBe("fresh-from-cookie");
    const mutationInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const headers = mutationInit.headers as Record<string, string>;
    expect(headers["x-csrf-token"]).toBe("fresh-from-cookie");
    expect(headers.referer).toBe("https://www.goodreads.com/");
    expect(headers.origin).toBe("https://www.goodreads.com");
    expect(headers["x-requested-with"]).toBe("XMLHttpRequest");
  });
});
