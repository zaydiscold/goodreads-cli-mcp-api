import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLiveRequestPlan, executeLiveRequest } from "../src/client/live.js";
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

const originalCookie = process.env.GOODREADS_COOKIE;
const originalCsrf = process.env.GOODREADS_CSRF_TOKEN;
const originalGenericGate = process.env.GOODREADS_ALLOW_GENERIC_WRITES;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalCookie === undefined) delete process.env.GOODREADS_COOKIE;
  else process.env.GOODREADS_COOKIE = originalCookie;
  if (originalCsrf === undefined) delete process.env.GOODREADS_CSRF_TOKEN;
  else process.env.GOODREADS_CSRF_TOKEN = originalCsrf;
  if (originalGenericGate === undefined) delete process.env.GOODREADS_ALLOW_GENERIC_WRITES;
  else process.env.GOODREADS_ALLOW_GENERIC_WRITES = originalGenericGate;
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
