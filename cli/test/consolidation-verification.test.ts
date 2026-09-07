import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCommentsPage } from "../src/parsers/commentsPage.js";
import { ls, ru, rv } from "../src/workflows/libraryWrites.js";
import { fetchAuthenticatedText } from "../src/client/http.js";

vi.mock("../src/client/live.js", async (original) => ({
  ...(await original<typeof import("../src/client/live.js")>()),
  executeLiveRequest: vi.fn(async () => ({
    requestAccepted: true,
    mutationVerified: false,
    status: 200,
  })),
}));
vi.mock("../src/client/http.js", async (original) => ({
  ...(await original<typeof import("../src/client/http.js")>()),
  fetchAuthenticatedText: vi.fn(),
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function auth() {
  vi.stubEnv("GOODREADS_COOKIE", "session-token=synthetic");
  vi.stubEnv("GOODREADS_USER_ID", "");
}

describe("semantic mutation receipts", () => {
  it.each([
    "failure",
    "<html>unrelated page</html>",
    '<form action="/review/update/999"><div data-rating="0"></div><textarea name="review[review]"></textarea></form>',
  ])("never verifies clears from absent or wrong-book evidence: %s", async (html) => {
    auth();
    if (html === "failure")
      vi.mocked(fetchAuthenticatedText).mockRejectedValue(new Error("offline"));
    else vi.mocked(fetchAuthenticatedText).mockResolvedValue({ html, signedOut: false } as never);
    const rating = await ru({
      bookId: "123",
      action: "clear",
      approvedBookId: ["123"],
      execute: true,
    });
    const review = await rv({
      bookId: "123",
      reviewText: "",
      approvedBookId: ["123"],
      approvedTextSha256: hash(""),
      execute: true,
    });
    for (const result of [rating, review])
      expect(result.data).toMatchObject({ ok: false, mutationVerified: false });
  });
  it("verifies explicit empty controls in the exact book form", async () => {
    auth();
    vi.mocked(fetchAuthenticatedText).mockResolvedValue({
      signedOut: false,
      html: '<form action="/review/update/123"><div data-rating="0"></div><textarea name="review[review]"></textarea></form>',
    } as never);
    expect(
      (await ru({ bookId: "123", action: "clear", approvedBookId: ["123"], execute: true })).data,
    ).toMatchObject({ ok: true, mutationVerified: true });
    expect(
      (
        await rv({
          bookId: "123",
          reviewText: "",
          approvedBookId: ["123"],
          approvedTextSha256: hash(""),
          execute: true,
        })
      ).data,
    ).toMatchObject({ ok: true, mutationVerified: true });
  });
  it("rejects invalid rating inputs at the shared API boundary", async () => {
    await expect(ru({ bookId: "123", action: "garbage" as never })).rejects.toThrow(/action/);
    expect((await ru({ bookId: "123", action: "set", rating: 2.5 as never })).data).toMatchObject({
      outcome: "blocked",
    });
  });
  it("does not use authenticated owner state for another explicit user", async () => {
    auth();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<rss><channel/></rss>")),
    );
    await ls({ bookId: "123", userId: "456" });
    expect(fetchAuthenticatedText).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("comment record counting", () => {
  it("excludes navigation and reports insufficient evidence", () => {
    const result = parseCommentsPage(
      '<a href="/comment/list/123-reader">Comments</a><a href="/comment/list/123-reader">Comments</a>',
    );
    expect(result).toMatchObject({ commentLinkCount: 0, countStatus: "not_evaluated" });
  });
  it("deduplicates exact records and strips private URLs", () => {
    const result = parseCommentsPage(
      '<a href="/comment/show/42?secret=private">body</a><a href="/comment/show/42">again</a><form action="/comment/update/42?secret=private"></form>',
    );
    expect(result.commentLinkCount).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/private|body|42/);
  });
});
