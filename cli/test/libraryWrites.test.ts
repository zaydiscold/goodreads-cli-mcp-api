import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ls, parseLibraryEditState, rv, ss } from "../src/workflows/libraryWrites.js";

const originalCookie = process.env.GOODREADS_COOKIE;
const originalUserId = process.env.GOODREADS_USER_ID;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalCookie === undefined) delete process.env.GOODREADS_COOKIE;
  else process.env.GOODREADS_COOKIE = originalCookie;
  if (originalUserId === undefined) delete process.env.GOODREADS_USER_ID;
  else process.env.GOODREADS_USER_ID = originalUserId;
});

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
      reviewId: "58169",
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
    expect(parseLibraryEditState(html)).toEqual({
      reviewId: null,
      status: "to-read",
      rating: 0,
      reviewText: "",
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

  it("uses the caller-supplied user id for the public RSS fallback", async () => {
    delete process.env.GOODREADS_COOKIE;
    delete process.env.GOODREADS_USER_ID;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        "<rss><channel><item><book_id>123</book_id><user_rating>4</user_rating><user_review><![CDATA[A review]]></user_review></item></channel></rss>",
        { status: 200, headers: { "content-type": "application/xml" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ls({ bookId: "123", userId: "42" });
    expect(
      dataOf<{
        userId: string;
        status: string;
        rating: number;
        review: { exists: boolean; textLength: number };
        sources: string[];
        evidence: { rssSuccessCount: number };
      }>(result),
    ).toMatchObject({
      userId: "42",
      status: "currently-reading",
      rating: 4,
      review: { exists: true, textLength: 8 },
      sources: ["https://www.goodreads.com/review/list_rss/42?shelf=currently-reading"],
      evidence: { rssSuccessCount: 1 },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses authenticated state without querying a personal default user id", async () => {
    process.env.GOODREADS_COOKIE = "session-token=goodreads-only";
    delete process.env.GOODREADS_USER_ID;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `<html>
          <a href="/user/sign_out">Sign Out</a>
          <form action="/review/update/999">
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
    expect(JSON.stringify(result)).not.toContain("179929687");
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
