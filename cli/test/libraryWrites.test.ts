import { afterEach, describe, expect, it, vi } from "vitest";
import { ls, parseLibraryEditState } from "../src/workflows/libraryWrites.js";

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
  it("parses the chosen exclusive shelf, rating, and review text", () => {
    const html = `
      <script>
        new ShelfChooser("shelfChooser_review_1", 58169,
          ["to-read", "currently-reading", "read", "custom"],
          { chosen: ["currently-reading", "custom"], exclusive: ["to-read", "currently-reading", "read"] });
      </script>
      <div data-rating="4.0"></div>
      <textarea name="review[review]">A &amp; B</textarea>
    `;
    expect(parseLibraryEditState(html)).toEqual({
      status: "currently-reading",
      rating: 4,
      reviewText: "A & B",
    });
  });

  it("falls back to the rendered shelf link and preserves empty review state", () => {
    const html = `
      <a class="shelfLink" href="/review/list/1?shelf=to-read">to-read</a>
      <div data-rating="0.0"></div>
      <textarea id="review_review_usertext"></textarea>
    `;
    expect(parseLibraryEditState(html)).toEqual({ status: "to-read", rating: 0, reviewText: "" });
  });
});

describe("library show account selection", () => {
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
      }>(result),
    ).toMatchObject({ userId: "42", status: "read", rating: 4, review: { exists: false } });
    const sources = dataOf<{ sources: string[] }>(result).sources;
    expect(sources).toHaveLength(2);
    expect(sources.every((url) => url.includes("/review/custom_widget/42.shelf?"))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the authenticated edit page without querying a personal default user id", async () => {
    process.env.GOODREADS_COOKIE = "session-token=goodreads-only";
    delete process.env.GOODREADS_USER_ID;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `<html>
          <a href="/user/sign_out">Sign Out</a>
          <script>{ chosen: ["read"], exclusive: ["to-read", "currently-reading", "read"] }</script>
          <div data-rating="5.0"></div>
          <textarea name="review[review]">Authenticated review</textarea>
        </html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ls({ bookId: "123" });
    expect(
      dataOf<{
        userId: string | null;
        status: string;
        rating: number;
        review: { exists: boolean; textLength: number };
        sources: string[];
      }>(result),
    ).toMatchObject({
      userId: null,
      status: "read",
      rating: 5,
      review: { exists: true, textLength: 20 },
      sources: ["https://www.goodreads.com/review/edit/123"],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://www.goodreads.com/review/edit/123");
    expect(JSON.stringify(result)).not.toContain("123456789");
  });
});
