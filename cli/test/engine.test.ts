import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bookShow, booksExport, booksList, messagesFolders, notesInspect } from "../src/engine.js";
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
      "fixture-dir is required when source is html",
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
});
