import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authorShow,
  bookShow,
  booksExport,
  booksList,
  messagesFolders,
  notesInspect,
  notesBooks,
  recommendationsList,
  searchBooks,
  similarBooks,
  shelvesDiscover,
  yearInBooks,
} from "../src/engine.js";
import { readShelfPagesFromFixtureDir } from "../src/shelf.js";

function shelfHtml(options: { shelf: string; bookId?: string; title?: string }): string {
  const bookId = options.bookId ?? "123";
  const title = options.title ?? "Example Book";
  return `
    <html><head><title>Reader's '${options.shelf}' books on Goodreads (1 book)</title></head>
    <body>
      <a href="/review/list/reader?shelf=${options.shelf}">${options.shelf} (1)</a>
      <table id="booksBody">
        <tr id="review_111">
          <td><input type="checkbox" name="reviews[111]" value="111"></td>
          <td><a href="/book/show/${bookId}-example">${title}</a></td>
        </tr>
      </table>
    </body></html>
  `;
}

function dataOf<T>(result: { data: unknown }): T {
  return result.data as T;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Goodreads engine correctness", () => {
  it("honors and validates the selected books source", async () => {
    const dir = await mkdtemp(join(tmpdir(), "goodreads-books-source-"));
    await writeFile(join(dir, "shelf-read.html"), shelfHtml({ shelf: "read" }));

    const html = await booksList({ shelf: "read", source: "html", fixtureDir: dir });
    expect(dataOf<{ source: string; rows: unknown[] }>(html)).toMatchObject({
      source: "html",
      rows: [{ bookId: "123" }],
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          "<rss><channel><title>read</title><item><title>RSS Book</title><book_id>456</book_id></item></channel></rss>",
          { status: 200, headers: { "content-type": "application/xml" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const rss = await booksList({
      shelf: "read",
      source: "rss",
      fixtureDir: dir,
      user: "reader",
    });
    expect(
      dataOf<{ source: string; rss: { items: Array<{ bookId: string }> } }>(rss),
    ).toMatchObject({ source: "rss", rss: { items: [{ bookId: "456" }] } });
    expect(fetchMock).toHaveBeenCalledOnce();

    await expect(booksList({ shelf: "read", source: "html" })).rejects.toThrow(
      "fixture-dir or user is required when source is html",
    );
    await expect(booksList({ shelf: "read", source: "rss" })).rejects.toThrow(
      "user is required when source is rss",
    );
    await expect(
      booksList({ shelf: "read", source: "atom" as "html", fixtureDir: dir }),
    ).rejects.toThrow("source must be one of html, rss");
  });

  it("derives message folders from a fixture instead of claiming hardcoded provenance", async () => {
    const dir = await mkdtemp(join(tmpdir(), "goodreads-message-folders-"));
    const fixture = join(dir, "messages.html");
    await writeFile(
      fixture,
      '<html><head><title>Saved</title></head><body><a href="/message/inbox">Inbox</a><a href="/message/saved?page=2">Saved</a></body></html>',
    );

    const result = await messagesFolders({ fixture });
    expect(dataOf<{ folders: Array<{ slug: string }>; page: { title: string } }>(result)).toEqual({
      folders: [
        { slug: "inbox", href: "/message/inbox" },
        { slug: "saved", href: "/message/saved?page=2" },
      ],
      page: { title: "Saved" },
    });
    expect(result.confidence).toBe("high");
    expect(result.warnings).toEqual([]);
  });

  it("requires exactly one book source", async () => {
    const dir = await mkdtemp(join(tmpdir(), "goodreads-book-show-"));
    const fixture = join(dir, "book.html");
    await writeFile(
      fixture,
      '<html><head><script type="application/ld+json">{"@type":"Book","name":"Fixture Book"}</script></head></html>',
    );

    await expect(bookShow({})).rejects.toThrow("exactly one of slugOrId or fixture is required");
    await expect(bookShow({ slugOrId: "123", fixture })).rejects.toThrow(
      "exactly one of slugOrId or fixture is required",
    );
    const result = await bookShow({ fixture });
    expect(dataOf<{ jsonLdBook: { name: string } }>(result).jsonLdBook.name).toBe("Fixture Book");
  });

  it("reads a similar-books fixture through the shared engine with a bounded limit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "goodreads-similar-books-"));
    const fixture = join(dir, "similar.html");
    await writeFile(
      fixture,
      `<div data-react-class="ReactComponents.SimilarBooksList" data-react-props='{"similarBooks":[{"book":{"bookId":"100","workId":"10","bookUrl":"/book/show/100.Source","title":"Source","author":{"name":"Source Author"}}}]}'></div>
       <div data-react-class="ReactComponents.SimilarBooksList" data-react-props='{"similarBooks":[{"book":{"bookId":"200","workId":"20","bookUrl":"/book/show/200.First","title":"First","author":{"name":"First Author"}}},{"book":{"bookId":"201","workId":"21","bookUrl":"/book/show/201.Second","title":"Second","author":{"name":"Second Author"}}}]}'></div>`,
    );

    await expect(similarBooks({})).rejects.toThrow(
      "exactly one of workSlug or fixture is required",
    );
    const result = await similarBooks({ fixture, limit: 1 });
    expect(dataOf<{ totalAvailable: number; books: Array<{ bookId: string }> }>(result)).toEqual(
      expect.objectContaining({
        totalAvailable: 2,
        books: [
          {
            bookId: "200",
            workId: "20",
            bookUrl: "/book/show/200.First",
            title: "First",
            author: "First Author",
            avgRating: null,
            ratingsCount: null,
            numPages: null,
          },
        ],
      }),
    );
    expect(result.confidence).toBe("high");
  });

  it("fetches and parses a public Year in Books page through the shared engine", async () => {
    const html = `
      <html><head><title>Reader's Year in Books</title></head><body>
        <a href="/user/sign_in">Sign In</a>
        <div class="herobannerYearText">2025</div>
        <div class="heroImageContainer">
          <div class="heroImageContainer__avatarOrCount"><div class="heroImageContainer__count">12</div><div class="heroImageContainer__countLabel">books read</div></div>
          <div class="heroImageContainer__avatarOrCount"><div class="heroImageContainer__count">4,200</div><div class="heroImageContainer__countLabel">pages read</div></div>
        </div>
        <div id="yyibAverageBookLengthLabel">Average book length in 2025</div><div class="yyibAverageBookLengthData">350 pages</div>
        <div id="yyibAverageRatingLabel">Reader's average rating for 2025</div><div class="yyibAverageRatingData"><div class="yyibAverageRatingData__pageCount">4.2</div></div>
      </body></html>
    `;
    const fetchMock = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await yearInBooks({ userId: "reader-1", year: 2025 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/user/year_in_books/2025/reader-1");
    expect(dataOf<{ booksRead: number; pagesRead: number }>(result)).toMatchObject({
      booksRead: 12,
      pagesRead: 4200,
    });
    expect(result.confidence).toBe("high");
    expect(dataOf<{ signedOut: boolean }>(result).signedOut).toBe(false);
  });

  it("fetches annotated-book metadata and applies a bounded limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          annotated_books_collection: [
            { asin: "A", title: "One", authorName: "Author", sharedCount: 1 },
            { asin: "B", title: "Two", authorName: "Author", sharedCount: 2 },
          ],
          next_token: { cursor: "opaque-secret" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await notesBooks({ userId: "179929687", limit: 1 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/notes/179929687/load_more");
    expect(
      dataOf<{
        totalAvailable: number;
        returnedCount: number;
        nextTokenPresent: boolean;
        books: unknown[];
      }>(result),
    ).toMatchObject({ totalAvailable: 2, returnedCount: 1, nextTokenPresent: true });
    expect(dataOf<{ books: unknown[] }>(result).books).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("opaque-secret");
  });

  it("reports a non-JSON notes-books response as low confidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>Sign in</html>", { status: 200 })),
    );
    const result = await notesBooks({ userId: "179929687" });
    expect(result.confidence).toBe("low");
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining("non-JSON")]));
  });

  it("exports and auto-discovers alternate shelf fixture names", async () => {
    const dir = await mkdtemp(join(tmpdir(), "goodreads-alternate-shelf-"));
    await writeFile(join(dir, "read-shelf.html"), shelfHtml({ shelf: "read" }));

    const result = await booksExport({ fixtureDir: dir });
    expect(dataOf<{ shelves: string[]; books: Array<{ bookId: string }> }>(result)).toMatchObject({
      shelves: ["read"],
      books: [{ bookId: "123" }],
    });
    expect(result.warnings).toEqual([]);
  });

  it("escapes regex metacharacters in shelf fixture names", async () => {
    const dir = await mkdtemp(join(tmpdir(), "goodreads-regex-shelf-"));
    await writeFile(join(dir, "shelf-sci[fi-page2.html"), shelfHtml({ shelf: "sci[fi" }));

    const pages = await readShelfPagesFromFixtureDir(dir, "sci[fi");
    expect(pages).toHaveLength(1);
    expect(pages[0]?.rows[0]?.bookId).toBe("123");
  });

  it("redacts note identifiers by default and makes private output explicit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "goodreads-notes-privacy-"));
    const fixture = join(dir, "notes.html");
    await writeFile(
      fixture,
      '<html><body><div class="js-readingNote" data-visible="true" data-annotation-pair-id="private-pair" data-note-persist-endpoint="/notes/123/private-pair/note"></div></body></html>',
    );

    const redacted = await notesInspect({ fixture });
    expect(
      dataOf<{ notes: Array<{ annotationPairId: string; notePersistEndpoint: string }> }>(redacted)
        .notes[0],
    ).toMatchObject({
      annotationPairId: "<redacted>",
      notePersistEndpoint: "<redacted>",
    });
    expect(JSON.stringify(redacted)).not.toContain("private-pair");

    const privateResult = await notesInspect({ fixture, includePrivateIds: true });
    expect(
      dataOf<{ notes: Array<{ annotationPairId: string; notePersistEndpoint: string }> }>(
        privateResult,
      ).notes[0],
    ).toMatchObject({
      annotationPairId: "private-pair",
      notePersistEndpoint: "/notes/123/private-pair/note",
    });
    expect(privateResult.warnings).toHaveLength(1);
  });

  it("fetches live authenticated HTML shelf page when user is provided without fixture-dir", async () => {
    const signedInHtml = `
      <html><head><title>Reader's 'read' books on Goodreads (3 books)</title></head>
      <body>
        <a href="/user/sign_out">Sign Out</a>
        <a href="/review/list/reader?shelf=read">read (3)</a>
        <table id="booksBody">
          <tr id="review_111">
            <td><a href="/book/show/123-book">Live Book</a></td>
            <td class="author"><a>Live Author</a></td>
          </tr>
        </table>
        <div id="reviewPagination">
          <em class="current">1</em>
          <a href="/review/list/reader?page=2&amp;shelf=read">2</a>
        </div>
      </body></html>
    `;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(signedInHtml, { status: 200, headers: { "content-type": "text/html" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    process.env.GOODREADS_COOKIE = "test-session";

    const result = await booksList({ shelf: "read", source: "html", user: "reader" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const callUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(callUrl).toContain("shelf=read");
    expect(callUrl).toContain("per_page=100");
    const callHeaders = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(callHeaders.cookie).toBe("test-session");
    expect(callHeaders.referer).toBe("https://www.goodreads.com/");

    const data = dataOf<{
      source: string;
      rows: Array<{ bookId: string }>;
      pagination: { complete: boolean; pagesSeen: number[] };
    }>(result);
    expect(data.source).toBe("html");
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]?.bookId).toBe("123");
    expect(data.pagination.pagesSeen).toEqual([1]);
    expect(data.pagination.complete).toBe(false); // 3 declared but 1 parsed
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("Live HTML fetches a single page")]),
    );

    delete process.env.GOODREADS_COOKIE;
  });

  it("detects signed-out wall on live authenticated HTML shelf fetch", async () => {
    const signedOutHtml = '<html>Sign in to Goodreads<a href="/user/sign_in">Sign In</a></html>';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(signedOutHtml, { status: 200, headers: { "content-type": "text/html" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    process.env.GOODREADS_COOKIE = "stale-session";

    const result = await booksList({ shelf: "read", source: "html", user: "reader" });
    const data = dataOf<{ signedOut: boolean; rows: unknown[] }>(result);
    expect(data.signedOut).toBe(true);
    expect(result.confidence).toBe("low");
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("sign-in wall")]),
    );

    delete process.env.GOODREADS_COOKIE;
  });

  it("warns on shelf discovery when cookie is missing for live fetch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          '<html><title>Books</title><a href="/review/list/reader?shelf=read">read (1)</a></html>',
          { status: 200, headers: { "content-type": "text/html" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    delete process.env.GOODREADS_COOKIE;

    const result = await shelvesDiscover({ user: "reader" });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("GOODREADS_COOKIE is not set")]),
    );
    const data = dataOf<{ shelves: Array<{ slug: string }> }>(result);
    expect(data.shelves).toHaveLength(1);
    expect(data.shelves[0]?.slug).toBe("read");
  });

  it("fetches mapped discovery reads through the shared engine and reports bot walls", async () => {
    process.env.GOODREADS_COOKIE =
      "_session_id2=goodreads; aws-waf-token=waf; at-main=amazon; session-token=retail";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          '<a class="bookTitle" href="/book/show/123-example">Example</a><a class="authorName">Author</a>',
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          '<div class="bookBox"><a href="/book/show/456-rec"><img alt="Rec"></a></div>',
          {
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(new Response('<h1 class="authorName">Author</h1>', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const search = await searchBooks({ query: "Example", limit: 1 });
    const recommendations = await recommendationsList({ limit: 1 });
    const author = await authorShow({ authorSlug: "1.Author", limit: 1 });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/search?q=Example&search_type=books");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/recommendations");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("/author/show/1.Author");
    const searchHeaders = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    const recommendationHeaders = (fetchMock.mock.calls[1]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    const authorHeaders = (fetchMock.mock.calls[2]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(searchHeaders.cookie).toBe("_session_id2=goodreads; aws-waf-token=waf");
    expect(authorHeaders.cookie).toBe("_session_id2=goodreads; aws-waf-token=waf");
    expect(recommendationHeaders.cookie).toContain("at-main=amazon");
    expect(recommendationHeaders.cookie).toContain("session-token=retail");
    expect(dataOf<{ books: Array<{ bookId: string }> }>(search).books).toEqual([
      { bookId: "123", title: "Example", author: "Author", ratingSummary: null },
    ]);
    expect(dataOf<{ books: Array<{ bookId: string }> }>(recommendations).books[0]?.bookId).toBe(
      "456",
    );
    expect(dataOf<{ name: string }>(author).name).toBe("Author");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("robot check", { status: 200 })));
    const blocked = await searchBooks({ query: "Example" });
    expect(blocked.confidence).toBe("low");
    expect(blocked.warnings).toContain(
      "Goodreads returned an anti-bot challenge instead of discovery results.",
    );
    delete process.env.GOODREADS_COOKIE;
  });

  it("detects signed-out on shelf discovery when cookie is set but expired", async () => {
    const signedOutHtml = '<html>Sign in to Goodreads<a href="/user/sign_in">Sign In</a></html>';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(signedOutHtml, { status: 200, headers: { "content-type": "text/html" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    process.env.GOODREADS_COOKIE = "expired-session";

    const result = await shelvesDiscover({ user: "reader" });
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("sign-in wall")]),
    );
    expect(result.confidence).toBe("low");

    delete process.env.GOODREADS_COOKIE;
  });
});
