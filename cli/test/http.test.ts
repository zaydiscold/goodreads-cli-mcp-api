import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchAuthenticatedText,
  fetchPublicText,
  fetchText,
  mergeRedirectCookies,
} from "../src/client/http.js";

const originalCookie = process.env.GOODREADS_COOKIE;

const httpClients: Array<{
  name: string;
  run: (url: string) => Promise<unknown>;
}> = [
  { name: "anonymous", run: fetchText },
  { name: "public-cookie", run: fetchPublicText },
  { name: "authenticated", run: fetchAuthenticatedText },
];

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalCookie === undefined) delete process.env.GOODREADS_COOKIE;
  else process.env.GOODREADS_COOKIE = originalCookie;
});

describe("Goodreads HTTP origin boundary", () => {
  it.each([
    "https://attacker.invalid/capture",
    "https://www.goodreads.com.attacker.invalid/capture",
    "http://www.goodreads.com/review/list",
    "https://user:password@www.goodreads.com/review/list",
  ])("rejects untrusted or credential-bearing URL %s before fetch", async (url) => {
    process.env.GOODREADS_COOKIE = "session-token=secret";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const client of httpClients) {
      await expect(client.run(url), client.name).rejects.toThrow(
        /restricted to https:\/\/www\.goodreads\.com|must not include embedded credentials/,
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows bounded same-origin redirects while preserving the authenticated session", async () => {
    process.env.GOODREADS_COOKIE = "session-token=goodreads-only";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "/review/list?page=2" },
        }),
      )
      .mockResolvedValueOnce(
        new Response('<html><a href="/user/sign_out">Sign Out</a></html>', {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAuthenticatedText("https://www.goodreads.com/review/list");

    expect(result.signedOut).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://www.goodreads.com/review/list");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://www.goodreads.com/review/list?page=2");
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(init.redirect).toBe("manual");
      expect(headers.cookie).toBe("session-token=goodreads-only");
      expect(headers.origin).toBe("https://www.goodreads.com");
    }
  });

  it("refuses a cross-origin redirect before forwarding the cookie", async () => {
    process.env.GOODREADS_COOKIE = "session-token=secret";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://attacker.invalid/capture" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAuthenticatedText("https://www.goodreads.com/review/list")).rejects.toThrow(
      "cross-origin redirect",
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).cookie).toBe("session-token=secret");
    expect(init.redirect).toBe("manual");
  });

  it("refuses a same-origin redirect with embedded credentials", async () => {
    process.env.GOODREADS_COOKIE = "session-token=secret";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location: "https://user:password@www.goodreads.com/review/list?page=2",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAuthenticatedText("https://www.goodreads.com/review/list")).rejects.toThrow(
      "redirect with embedded credentials",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("redirect cookie carry-over", () => {
  it("resends cookies set by a same-origin redirect, like a browser", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: [
            ["location", "https://www.goodreads.com/search?q=x"],
            ["set-cookie", "_session_id2=abc; path=/; HttpOnly"],
            ["set-cookie", "locale=en; path=/"],
          ],
        }),
      )
      .mockResolvedValueOnce(new Response("<html>results</html>", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchText("https://www.goodreads.com/search?q=x")).resolves.toContain("results");
    const first = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const second = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(first.headers).not.toHaveProperty("cookie");
    expect((second.headers as Record<string, string>).cookie).toBe("_session_id2=abc; locale=en");
  });

  it("merges redirect cookies into an existing jar and honours deletions", () => {
    expect(
      mergeRedirectCookies("a=1; b=2", ["b=3; path=/", "a=; Max-Age=0", "c=4", "bad name=5"]),
    ).toBe("b=3; c=4");
    expect(mergeRedirectCookies("a=1", [])).toBe("a=1");
    expect(mergeRedirectCookies(undefined, ["a=; max-age=0"])).toBeUndefined();
  });
});
