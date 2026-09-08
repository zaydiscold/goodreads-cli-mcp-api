import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCommentsPage } from "../src/parsers/commentsPage.js";
import { ls, ru, rv } from "../src/workflows/libraryWrites.js";
import { fetchAuthenticatedText } from "../src/client/http.js";
import { executeLiveRequest } from "../src/client/live.js";

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

it("preserves review settings and private notes when replacing through an absolute form action", async () => {
  auth();
  vi.mocked(fetchAuthenticatedText).mockResolvedValue({
    signedOut: false,
    html: '<form action="https://www.goodreads.com/review/update/123"><textarea name="review[review]">Replacement</textarea><input name="review[spoiler_flag]" value="0"><input type="checkbox" checked name="review[spoiler_flag]" value="1"><input name="review[sell_flag]" value="0"><textarea name="review[notes]">synthetic private note</textarea></form>',
  });
  const receipt = await rv({
    bookId: "123",
    reviewText: "Replacement",
    execute: true,
    approvedBookId: ["123"],
    approvedTextSha256: hash("Replacement"),
  });
  expect(executeLiveRequest).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      form: expect.objectContaining({
        "review[spoiler_flag]": "1",
        "review[sell_flag]": "0",
        "review[notes]": "synthetic private note",
      }),
    }),
  );
  expect(JSON.stringify(receipt)).not.toContain("synthetic private note");
});
function auth() {
  vi.stubEnv("GOODREADS_COOKIE", "session-token=synthetic");
  vi.stubEnv("GOODREADS_USER_ID", "");
}

describe("semantic mutation receipts", () => {
  it("marks wrong-book form evidence as unsuccessful", async () => {
    auth();
    vi.mocked(fetchAuthenticatedText).mockResolvedValue({
      signedOut: false,
      html: '<form action="/review/update/999"><textarea name="review[review]"></textarea></form>',
    });
    expect((await ls({ bookId: "123" })).data).toMatchObject({
      evidence: { authenticatedSuccess: false, stateObserved: false },
      sourceResults: [expect.objectContaining({ source: "authenticated-edit", ok: false })],
    });
  });

  it.each([
    "failure",
    "<html>unrelated page</html>",
    '<form action="/review/update/999"><textarea name="review[review]"></textarea></form>',
    '<form action="/review/update/123"><div data-rating="0"></div></form>',
  ])("does not confirm a submitted review clear after failed readback: %s", async (html) => {
    auth();
    const read = vi.mocked(fetchAuthenticatedText).mockResolvedValueOnce({
      signedOut: false,
      html: '<form action="/review/update/123"><textarea name="review[review]">Existing review</textarea></form>',
    });
    if (html === "failure") read.mockRejectedValueOnce(new Error("offline"));
    else read.mockResolvedValueOnce({ html, signedOut: false });
    const result = await rv({
      bookId: "123",
      reviewText: "",
      approvedBookId: ["123"],
      approvedTextSha256: hash(""),
      execute: true,
    });
    expect(executeLiveRequest).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.data).toMatchObject({
      ok: false,
      outcome: "indeterminate",
      mutationVerified: false,
    });
  });

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

describe("review append", () => {
  it("previews the combined content without exposing it", async () => {
    auth();
    vi.mocked(fetchAuthenticatedText).mockResolvedValue({
      signedOut: false,
      html: '<form action="/review/update/123"><textarea name="review[review]">Existing private review</textarea><input type="checkbox" name="review[spoiler_flag]" value="1" checked></form>',
    } as never);
    const result = await rv({ bookId: "123", reviewText: "New addendum", mode: "append" });
    expect(result.data).toMatchObject({
      mode: "append",
      outcome: "planned",
      previousTextSha256: hash("Existing private review"),
      textSha256: hash("Existing private review New addendum"),
    });
    expect(JSON.stringify(result)).not.toMatch(/Existing private review|New addendum/);
  });
  it("blocks append when the existing review changed after approval", async () => {
    auth();
    vi.mocked(fetchAuthenticatedText).mockResolvedValue({
      signedOut: false,
      html: '<form action="/review/update/123"><textarea name="review[review]">Changed review</textarea></form>',
    } as never);
    await expect(
      rv({
        bookId: "123",
        reviewText: "Addendum",
        mode: "append",
        execute: true,
        approvedPreviousTextSha256: hash("Original review"),
      }),
    ).rejects.toThrow(/Existing review changed/);
  });
});
