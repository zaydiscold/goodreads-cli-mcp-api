import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ls,
  parseLibraryEditFlight,
  parseLibraryEditState,
  rv,
  ss,
} from "../src/workflows/libraryWrites.js";

const originalCookie = process.env.GOODREADS_COOKIE;
const originalUserId = process.env.GOODREADS_USER_ID;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalCookie === undefined) delete process.env.GOODREADS_COOKIE;
  else process.env.GOODREADS_COOKIE = originalCookie;
  if (originalUserId === undefined) delete process.env.GOODREADS_USER_ID;
  else process.env.GOODREADS_USER_ID = originalUserId;
});

const widgetBody = (shelf: string, items: string) =>
  `  var widget_code = '  <div class=\\"gr_custom_container_1\\">\\n<h2 class=\\"gr_custom_header_1\\"><a href=\\"https:\\/\\/www.goodreads.com\\/review\\/list\\/42-reader?shelf=${shelf}&amp;utm_medium=api\\">R<\\/a><\\/h2>${items}<\\/div>'\n`;
const widgetItem = (bookId: string, title: string, stars = 0) =>
  `<div class=\\"gr_custom_each_container_1\\"><div class=\\"gr_custom_book_container_1\\"><a title=\\"${title}\\" href=\\"https:\\/\\/www.goodreads.com\\/review\\/show\\/9${bookId}\\"><img src=\\"https:\\/\\/i.gr-assets.com\\/books\\/1l\\/${bookId}._SX50_.jpg\\" \\/><\\/a><\\/div><div class=\\"gr_custom_rating_1\\">${Array.from({ length: 5 }, (_, i) => `<img src=\\"star_${i < stars ? "active" : "inactive"}.png\\" \\/>`).join("")}<\\/div><div class=\\"gr_custom_author_1\\">by <a href=\\"https:\\/\\/www.goodreads.com\\/author\\/show\\/1.A\\">An Author<\\/a><\\/div><\\/div>`;

function dataOf<T>(result: { data: unknown }): T {
  return result.data as T;
}

describe("authenticated library edit state", () => {
  it("parses review id, shelf, rating, and canonical review text", () => {
    const html = `
      <form action="/review/update/58169">
        <script>
          new ShelfChooser("shelfChooser_review_1", 58169,
            ["to-read", "currently-reading", "read", "custom"],
            { chosen: ["currently-reading", "custom"], exclusive: ["to-read", "currently-reading", "read"] });
        </script>
        <div data-rating="4.0"></div>
        <textarea name="review[review]">A   &amp;   B</textarea>
      </form>
    `;
    expect(parseLibraryEditState(html)).toEqual({
      reviewId: null,
      status: "currently-reading",
      rating: 4,
      reviewText: "A & B",
      reviewObserved: true,
    });
  });

  it("falls back to the rendered shelf link and preserves empty review state", () => {
    const html = `
      <a class="shelfLink" href="/review/list/1?shelf=to-read">to-read</a>
      <div data-rating="0.0"></div>
      <textarea id="review_review_usertext"></textarea>
    `;
    expect(parseLibraryEditState(html)).toEqual({
      reviewId: null,
      status: "to-read",
      rating: 0,
      reviewText: "",
      reviewObserved: true,
    });
  });
});

describe("library show account selection and evidence", () => {
  it("requires an explicit user id or authenticated session", async () => {
    delete process.env.GOODREADS_COOKIE;
    delete process.env.GOODREADS_USER_ID;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(ls({ bookId: "123" })).rejects.toThrow("requires userId/GOODREADS_USER_ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the caller-supplied user id for the public shelf widget fallback", async () => {
    delete process.env.GOODREADS_COOKIE;
    delete process.env.GOODREADS_USER_ID;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const shelf = new URL(String(url)).searchParams.get("shelf") ?? "";
      const items =
        shelf === "read" ? widgetItem("123", "Found Book", 4) : widgetItem("999", "Other Book");
      return new Response(widgetBody(shelf, items), {
        status: 200,
        headers: { "content-type": "application/javascript" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await ls({ bookId: "123", userId: "42" });
    expect(
      dataOf<{
        userId: string;
        status: string;
        rating: number;
        review: { exists: boolean };
        sources: string[];
        evidence: { publicSuccessCount: number };
      }>(result),
    ).toMatchObject({
      userId: "42",
      status: "read",
      rating: 4,
      review: { exists: false },
      evidence: { publicSuccessCount: 2 },
    });
    const sources = dataOf<{ sources: string[] }>(result).sources;
    expect(sources).toHaveLength(2);
    expect(sources.every((url) => url.includes("/review/custom_widget/42.shelf?"))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses authenticated state without querying a personal default user id", async () => {
    process.env.GOODREADS_COOKIE = "session-token=goodreads-only";
    delete process.env.GOODREADS_USER_ID;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `<html>
          <a href="/user/sign_out">Sign Out</a>
          <form action="/review/update/123"><a href="/review/show/999">Review</a>
            <script>{ chosen: ["read"], exclusive: ["to-read", "currently-reading", "read"] }</script>
            <div data-rating="5.0"></div>
            <textarea name="review[review]">Authenticated review</textarea>
          </form>
        </html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ls({ bookId: "123", includeReviewId: true });
    expect(
      dataOf<{
        userId: string | null;
        reviewId: string;
        status: string;
        rating: number;
        review: { exists: boolean; textLength: number };
        evidence: { authenticatedSuccess: boolean };
      }>(result),
    ).toMatchObject({
      userId: null,
      reviewId: "999",
      status: "read",
      rating: 5,
      review: { exists: true, textLength: 20 },
      evidence: { authenticatedSuccess: true },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://www.goodreads.com/review/edit/123");
    expect(JSON.stringify(result)).not.toContain("123456789");
  });

  it("returns low confidence and warnings when every configured source fails", async () => {
    delete process.env.GOODREADS_COOKIE;
    const fetchMock = vi.fn().mockRejectedValue(new Error("network unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await ls({ bookId: "123", userId: "42" });
    expect(result.confidence).toBe("low");
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("No library-state source succeeded")]),
    );
  });
});

describe("library write intent binding", () => {
  it("requires exact status approval before route resolution", async () => {
    await expect(
      ss({
        bookId: "123",
        status: "read",
        approvedBookId: ["123"],
        execute: true,
      }),
    ).resolves.toMatchObject({
      data: { outcome: "blocked", blockers: ["approvedStatus required for execute"] },
    });
  });

  it("requires the exact canonical review hash", async () => {
    const canonical = "A review";
    const hash = createHash("sha256").update(canonical).digest("hex");
    const missing = await rv({
      bookId: "123",
      reviewText: "A   review",
      approvedBookId: ["123"],
      execute: true,
    });
    expect(missing.data).toMatchObject({
      outcome: "blocked",
      blockers: ["approvedTextSha256 required for execute"],
      textSha256: hash,
    });

    const mismatched = await rv({
      bookId: "123",
      reviewText: "A   review",
      approvedBookId: ["123"],
      approvedTextSha256: "0".repeat(64),
      execute: true,
    });
    expect(mismatched.data).toMatchObject({
      outcome: "blocked",
      blockers: ["approvedTextSha256 mismatch"],
    });
  });
});

describe("redesigned review edit page", () => {
  // Shape copied from the live Next.js /review/edit/{id} flight payload
  // (2026-11-04), with ids anonymized.
  function flightPage(options: { legacyId: number; shelf: string; review: unknown }): string {
    const payload =
      `"viewerShelvings":[{"review":null,"book":{"id":"kca://book/amzn1.gr.book.v3.AAA","legacyId":${options.legacyId},"__typename":"Book"},` +
      `"shelf":{"id":null,"name":"${options.shelf}","__typename":"Shelf"},"__typename":"Shelving"}],"viewerOwnedEditions":[]},` +
      `"viewerShelving":{"id":"kca://review:goodreads/x","book":{"id":"kca://book/amzn1.gr.book.v3.AAA","__typename":"Book"},` +
      `"shelf":{"id":"kca://user_shelf/s","name":"${options.shelf}","__typename":"Shelf"},"taggings":[],` +
      `"review":${JSON.stringify(options.review)},"__typename":"Shelving"}`;
    const half = Math.floor(payload.length / 2);
    const chunk = (text: string) =>
      `<script>self.__next_f.push([1,${JSON.stringify(text)}])</script>`;
    return `<html><body><form action="https://www.goodreads.com/search"></form>${chunk(payload.slice(0, half))}${chunk(payload.slice(half))}</body></html>`;
  }

  it("reads shelf, rating and review text across split flight chunks", () => {
    const html = flightPage({
      legacyId: 123,
      shelf: "read",
      review: { rating: 4, preciseRating: 4, text: "Loved &amp;  it", spoilerStatus: false },
    });
    expect(parseLibraryEditFlight(html, "123")).toEqual({
      reviewId: null,
      status: "read",
      rating: 4,
      reviewText: "Loved & it",
      reviewObserved: true,
    });
  });

  it("treats a missing review as unrated with no text", () => {
    const html = flightPage({ legacyId: 123, shelf: "currently-reading", review: null });
    expect(parseLibraryEditFlight(html, "123")).toMatchObject({
      status: "currently-reading",
      rating: 0,
      reviewText: "",
    });
  });

  it("refuses a shelving for any other book and pages without the payload", () => {
    const html = flightPage({ legacyId: 999, shelf: "read", review: { rating: 5, text: null } });
    expect(parseLibraryEditFlight(html, "123")).toBeNull();
    expect(parseLibraryEditFlight("<html><body>sign in</body></html>", "123")).toBeNull();
  });
});
