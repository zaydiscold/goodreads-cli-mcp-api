import { describe, expect, it } from "vitest";
import {
  parseSearchResultsPage,
  parseSimilarBooksPage,
} from "../src/parsers/discoveryPage.js";
import { parseShelfRss } from "../src/parsers/rss.js";
import { parseShelfHtml } from "../src/parsers/shelfHtml.js";

describe("parser normalization edges", () => {
  it("accepts absolute Goodreads book links and rejects lookalike origins", () => {
    const parsed = parseSearchResultsPage(`
      <table>
        <tr>
          <td>
            <a class="bookTitle" href="https://www.goodreads.com/book/show/123.Example?from_search=true">Example</a>
            <a class="authorName">Example Author</a>
          </td>
        </tr>
        <tr>
          <td>
            <a class="bookTitle" href="https://www.goodreads.com.attacker.invalid/book/show/999.Fake">Fake</a>
          </td>
        </tr>
      </table>
    `);

    expect(parsed.books).toEqual([
      {
        bookId: "123",
        title: "Example",
        author: "Example Author",
        ratingSummary: null,
      },
    ]);
  });

  it("retains similar books with missing work ids and normalizes numeric metadata", () => {
    const source = JSON.stringify({
      similarBooks: [
        {
          book: {
            bookId: "100",
            workId: null,
            bookUrl: "/book/show/100.Source",
            title: "Source",
            author: { name: "Source Author" },
          },
        },
      ],
    });
    const recommendations = JSON.stringify({
      similarBooks: [
        {
          book: {
            bookId: 200,
            workId: null,
            bookUrl: "https://www.goodreads.com/book/show/200.First?from_similar=true#ref",
            title: "First",
            author: { name: "First Author" },
            avgRating: "4.25",
            ratingsCount: "1,234",
            numPages: "320",
          },
        },
        {
          book: {
            bookId: "201",
            workId: null,
            bookUrl: "https://example.invalid/book/show/201.Second",
            title: "Second",
            author: { name: "Second Author" },
          },
        },
      ],
    });

    const parsed = parseSimilarBooksPage(`
      <div data-react-class="ReactComponents.SimilarBooksList" data-react-props='${source}'></div>
      <div data-react-class="ReactComponents.SimilarBooksList" data-react-props='${recommendations}'></div>
    `);

    expect(parsed.source?.bookId).toBe("100");
    expect(parsed.books).toEqual([
      {
        bookId: "200",
        workId: null,
        bookUrl: "/book/show/200.First",
        title: "First",
        author: "First Author",
        avgRating: 4.25,
        ratingsCount: 1234,
        numPages: 320,
      },
      {
        bookId: "201",
        workId: null,
        bookUrl: null,
        title: "Second",
        author: "Second Author",
        avgRating: null,
        ratingsCount: null,
        numPages: null,
      },
    ]);
  });

  it("parses comma-formatted shelf counts and emits only normalized Goodreads paths", () => {
    const parsed = parseShelfHtml(`
      <html>
        <head><title>Reader's 'read' books on Goodreads (1,234 books)</title></head>
        <body>
          <a href="https://www.goodreads.com/review/list/42?shelf=read">Read (1,234)</a>
          <a href="https://example.invalid/review/list/42?shelf=private">External (9)</a>
          <table id="booksBody">
            <tr id="review_7">
              <td class="title">
                <a class="bookTitle" href="https://www.goodreads.com/book/show/123.Example?from_shelf=true">Example</a>
              </td>
            </tr>
          </table>
          <div id="reviewPagination">
            <a href="/review/list/42?page=2&amp;shelf=read">2</a>
            <a href="https://www.goodreads.com/review/list/42?page=2&amp;shelf=read">2 duplicate</a>
          </div>
        </body>
      </html>
    `);

    expect(parsed.declaredBookCount).toBe(1234);
    expect(parsed.shelfInventory).toEqual([
      {
        slug: "read",
        displayName: "Read",
        count: 1234,
        href: "/review/list/42?shelf=read",
        kind: "account_shelf",
        isObservedForThisAccount: true,
      },
    ]);
    expect(parsed.rows[0]).toMatchObject({
      reviewId: "7",
      bookId: "123",
      bookHref: "/book/show/123.Example",
      title: "Example",
    });
    expect(parsed.pageLinks).toEqual([
      {
        page: 2,
        label: "2",
        href: "/review/list/42?page=2&shelf=read",
      },
    ]);
  });

  it("extracts RSS text nodes without serializing XML attributes and parses ratings safely", () => {
    const parsed = parseShelfRss(`
      <rss>
        <channel>
          <title>Reader shelf</title>
          <item>
            <title>Example</title>
            <guid isPermaLink="false">https://www.goodreads.com/book/show/123.Example</guid>
            <book_id>123</book_id>
            <user_rating>4.0</user_rating>
          </item>
        </channel>
      </rss>
    `);

    expect(parsed.items[0]).toMatchObject({
      title: "Example",
      guid: "https://www.goodreads.com/book/show/123.Example",
      bookId: "123",
      userRating: 4,
    });
    expect(JSON.stringify(parsed)).not.toContain("@_isPermaLink");
  });
});
