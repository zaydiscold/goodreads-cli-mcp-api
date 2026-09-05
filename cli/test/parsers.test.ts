import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildLiveRequestPlan } from "../src/client/live.js";
import { parseBookPage } from "../src/parsers/bookPage.js";
import {
  parseAuthorPage,
  parseRecommendationsPage,
  parseSearchResultsPage,
  parseSimilarBooksPage,
} from "../src/parsers/discoveryPage.js";
import { parseYearInBooksPage } from "../src/parsers/yearInBooksPage.js";
import { parseMessagePage } from "../src/parsers/messagePage.js";
import { parseNotesPage } from "../src/parsers/notesPage.js";
import { parseNotesBooksPayload } from "../src/parsers/notesBooks.js";
import { parseShelfHtml } from "../src/parsers/shelfHtml.js";
import { parseShelfRss } from "../src/parsers/rss.js";
import {
  loadApiMapRoutes,
  loadBrowserRoutes,
  loadGraphqlCatalogRoutes,
  planBookshelfMove,
  planNotesPublicize,
  searchApiRoutes,
} from "../src/lib.js";
import { riskLevelForRoute } from "../src/risk.js";
import { buildRecentReadingNotes, checkPublicizeApproval } from "../src/workflows/recentReading.js";

describe("Goodreads parsers", () => {
  it("discovers account shelf inventory and rows from shelf HTML", () => {
    const html = `
      <html><head><title>Zayd Khan's 'to-read' books on Goodreads (132 books)</title></head>
      <body>
        <a href="/review/list/123456?shelf=%23ALL%23">All (28)</a>
        <a href="/review/list/reader-user?shelf=to-read">Want to Read (132)</a>
        <a href="/review/list/reader-user?shelf=for-the-aesthetic">for-the-aesthetic (2)</a>
        <table id="booksBody">
          <tr id="review_111">
            <td><input type="checkbox" name="reviews[111]" value="111"></td>
            <td class="field title">
              <a href="/book/show/123-example-book"><img src="cover.jpg" alt=""></a>
              <a class="bookTitle" href="/book/show/123-example-book"><span>Example Book</span></a>
            </td>
            <td class="author"><a>Example Author</a></td>
          </tr>
        </table>
        <div id="reviewPagination">
          <em class="current">1</em>
          <a rel="next" href="/review/list/123456?page=2&amp;shelf=to-read">2</a>
        </div>
      </body></html>
    `;

    const parsed = parseShelfHtml(html);
    expect(parsed.declaredBookCount).toBe(132);
    expect(parsed.shelfInventory.map((shelf) => shelf.slug)).toContain("to-read");
    expect(parsed.shelfInventory.map((shelf) => shelf.slug)).toContain("for-the-aesthetic");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.reviewId).toBe("111");
    expect(parsed.rows[0]?.bookId).toBe("123");
    expect(parsed.rows[0]?.title).toBe("Example Book");
    expect(parsed.pageLinks[0]?.page).toBe(2);
  });

  it("parses RSS without emitting raw descriptions or reviews", () => {
    const xml = `
      <rss><channel><title>Zayd's bookshelf: read</title>
        <item>
          <title>Example Book</title>
          <book_id>123</book_id>
          <author_name>Example Author</author_name>
          <user_rating>5</user_rating>
          <book_description>This would be long private-ish text.</book_description>
          <user_review>Owned review text.</user_review>
        </item>
      </channel></rss>
    `;

    const parsed = parseShelfRss(xml);
    expect(parsed.itemCount).toBe(1);
    expect(parsed.items[0]?.bookDescriptionLength).toBeGreaterThan(0);
    expect(parsed.items[0]).not.toHaveProperty("book_description");
    expect(parsed.items[0]).not.toHaveProperty("user_review");
  });

  it("parses book page JSON-LD and Next typenames", () => {
    const html = `
      <html><head>
        <title>Example by Author | Goodreads</title>
        <script type="application/ld+json">
          {"@type":"Book","name":"Example","author":{"name":"Author"},"aggregateRating":{"ratingValue":"4.5","ratingCount":"10"}}
        </script>
        <script id="__NEXT_DATA__">{"props":{"pageProps":{"apolloState":{"Book:1":{"__typename":"Book"}}}}}</script>
      </head><body></body></html>
    `;

    const parsed = parseBookPage(html);
    expect(parsed.jsonLdBook.name).toBe("Example");
    expect(parsed.jsonLdBook.authors).toEqual(["Author"]);
    expect(parsed.hasNextData).toBe(true);
    expect(parsed.nextDataTypenames.Book).toBe(1);
  });

  it("parses Year in Books stats and book identity without review text", () => {
    const html = `
      <html><head><title>Reader's Year in Books</title></head><body>
        <div class="herobannerYearText">2025</div>
        <div class="heroImageContainer">
          <div class="heroImageContainer__avatarOrCount"><div class="heroImageContainer__count">3,015</div><div class="heroImageContainer__countLabel">pages read</div></div>
          <div class="heroImageContainer__avatarOrCount"><div class="heroImageContainer__count">9</div><div class="heroImageContainer__countLabel">books read</div></div>
        </div>
        <div class="yyibBooksLockup__bookContainer"><a href="/book/show/101-short"><img alt="Short Book by Ada Author"></a><div id="yyibShortestBookHeading">Shortest Book</div><div id="yyibShortestBookLabel">280 pages</div></div>
        <div class="yyibBooksLockup__bookContainer"><a href="/book/show/202-long"><img alt="Long Book by Bob Author"></a><div id="yyibLongestBookHeading">Longest Book</div><div id="yyibLongestBookLabel">382 pages</div></div>
        <div id="yyibAverageBookLengthLabel">Average book length in 2025</div><div class="yyibAverageBookLengthData">335 pages</div>
        <div class="yyibBooksLockup__bookContainer"><a href="/book/show/303-most"><img alt="Most Book by Cee Author"></a><div id="yyibMostPopularHeading">Most Shelved</div><div id="yyibMostPopularLabel">860,295 people also shelved</div></div>
        <div class="yyibBooksLockup__bookContainer"><a href="/book/show/404-least"><img alt="Least Book by Dee Author"></a><div id="yyibLeastPopularHeading">Least Shelved</div><div id="yyibLeastPopularLabel">15,509 people also shelved</div></div>
        <div id="yyibAverageRatingLabel">Reader's average rating for 2025</div><div class="yyibAverageRatingData"><div class="yyibAverageRatingData__pageCount">4.6</div></div>
        <div class="crowdFavoriteWidget"><a href="/book/show/505-high"><img alt="High Book by Eve Author"></a><div class="yyibCrowdFavoriteHeading">Highest Rated on Goodreads</div><div class="yyibCrowdFavoriteRatingLabel">4.47 average</div></div>
        <div class="yyibFirstLastReview">Private review text must never be returned.</div>
      </body></html>
    `;
    const parsed = parseYearInBooksPage(html, { userId: "reader-1", year: 2025 });
    expect(parsed).toMatchObject({
      year: 2025,
      userId: "reader-1",
      booksRead: 9,
      pagesRead: 3015,
      averageBookLengthPages: 335,
      averageUserRating: 4.6,
    });
    expect(parsed.shortestBook).toMatchObject({
      bookId: "101",
      title: "Short Book",
      author: "Ada Author",
      pages: 280,
    });
    expect(parsed.longestBook?.pages).toBe(382);
    expect(parsed.mostShelvedBook?.shelvedCount).toBe(860295);
    expect(parsed.leastShelvedBook?.shelvedCount).toBe(15509);
    expect(parsed.highestRatedBook).toMatchObject({ bookId: "505", rating: 4.47 });
    expect(JSON.stringify(parsed)).not.toContain("Private review text");
  });

  it("parses notes metadata without note text", () => {
    const html = `
      <html><head><title>Notes</title></head><body>
        <a href="/notes/123-book/179-user">View your notes and highlights</a>
        <div class="js-readingNote" data-visible="true" data-annotation-pair-id="abc" data-note-persist-endpoint="/notes/123/abc/note">
          <span class="highlightText">Raw highlight text should not be emitted.</span>
          <input type="checkbox" class="js-spoiler">
        </div>
      </body></html>
    `;
    const parsed = parseNotesPage(html);
    expect(parsed.noteCount).toBe(1);
    expect(parsed.visibleCounts.true).toBe(1);
    expect(parsed.notes[0]?.notePersistEndpoint).toBe("/notes/123/abc/note");
    expect(JSON.stringify(parsed)).not.toContain("Raw highlight text");
  });

  it("separates highlights from attached notes and exposes the latest timestamp", () => {
    const html = `
      <html><body>
        <div class="js-readingNote" data-visible="true" data-annotation-pair-id="one"></div>
        <div class="js-readingNote" data-visible="true" data-annotation-pair-id="two"></div>
        <script>
          window.__notes = [
            {"type":"highlight","updatedAt":"2026-08-27T01:00:00.000-07:00"},
            {"type":"note","updatedAt":"2026-08-28T02:00:00.000-07:00"}
          ];
        </script>
        <span class="highlightText">Never emit either annotation body.</span>
      </body></html>
    `;
    const parsed = parseNotesPage(html);
    expect(parsed).toMatchObject({
      annotationCount: 2,
      highlightCount: 1,
      attachedNoteCount: 1,
      latestTimestamp: "2026-08-28T02:00:00.000-07:00",
    });
    expect(JSON.stringify(parsed)).not.toContain("Never emit either annotation body");
  });

  it("normalizes annotated-book metadata without treating object counts as zero", () => {
    const parsed = parseNotesBooksPayload({
      annotated_books_collection: [
        {
          asin: "B000TEST01",
          title: "Example Book",
          authorName: "Example Author",
          sharedCount: 3,
          highlightCount: {},
          noteCount: 2,
          readingNotesUrl: "https://www.goodreads.com/notes/123-example/179-reader?private=1",
          imageUrl: "https://images.example/private.jpg",
          privateAnnotationText: "must never survive",
        },
      ],
      next_token: {},
    });
    expect(parsed).toMatchObject({
      bookCount: 1,
      nextTokenPresent: false,
      books: [
        {
          asin: "B000TEST01",
          title: "Example Book",
          author: "Example Author",
          sharedCount: 3,
          highlightCount: null,
          highlightCountAvailable: false,
          noteCount: 2,
          noteCountAvailable: true,
          notesPath: "/notes/123-example/179-reader",
        },
      ],
    });
    expect(JSON.stringify(parsed)).not.toContain("must never survive");
    expect(JSON.stringify(parsed)).not.toContain("images.example");
    expect(JSON.stringify(parsed)).not.toContain("private=1");
  });

  it("parses message metadata without labels or bodies", () => {
    const html = `
      <html><head><title>inbox</title></head><body>
        <a href="/message/inbox">inbox</a>
        <a href="/message/saved">saved</a>
        <a href="/message/show/999">Sensitive subject</a>
        <form method="post" action="/message/move_batch?page=1">
          <input name="authenticity_token" value="secret">
          <input name="messages[999]" value="999">
        </form>
      </body></html>
    `;
    const parsed = parseMessagePage(html);
    expect(parsed.folders.map((folder) => folder.slug)).toContain("inbox");
    expect(parsed.messageLinks[0]?.messageId).toBe("999");
    expect(parsed.messageLinks[0]?.labelLength).toBe("Sensitive subject".length);
    expect(JSON.stringify(parsed)).not.toContain("Sensitive subject");
    expect(JSON.stringify(parsed)).not.toContain("secret");
  });

  it("searches the route map for note publicizing without live calls", async () => {
    const routes = searchApiRoutes(await loadApiMapRoutes(), "publicize notes", 5);
    expect(routes[0]?.path).toBe("/notes/{book_id}/share");
    expect(routes[0]?.mutatesAccount).toBe(true);
    expect(routes[0]?.requiresApproval).toBe(true);
  });

  it("keeps sitemap-discovered public hubs searchable", async () => {
    const routes = await loadApiMapRoutes();
    expect(
      searchApiRoutes(routes, "ask the author questions", 5).map((route) => route.path),
    ).toContain("/ask_the_author");
    expect(searchApiRoutes(routes, "similar books readers also enjoyed", 5)[0]?.path).toBe(
      "/book/similar/{work_slug}",
    );
    expect(searchApiRoutes(routes, "choice awards", 5).map((route) => route.path)).toContain(
      "/choiceawards",
    );
  });

  it("builds dry-run plans for notes and shelf writes", () => {
    expect(
      planNotesPublicize({
        bookId: "654321",
        bookSlug: "654321-example-book",
        userSlug: "reader-user",
      }),
    ).toMatchObject({
      dryRun: true,
      method: "PUT",
      route: "/notes/654321/share",
      verifyRouteTemplate: "/notes/{book_slug}/{user_slug}",
      verify: "/notes/654321-example-book/reader-user",
    });
    expect(planBookshelfMove({ reviewId: "111", toShelf: "read", user: "123456" })).toMatchObject({
      dryRun: true,
      method: "POST",
      route: "/review/update_list/123456",
      verify: "/review/list/123456?shelf=read",
    });
  });

  it("builds live request dry-runs without an env write gate", async () => {
    const route = (await loadApiMapRoutes()).find(
      (candidate) => candidate.path === "/notes/{book_id}/share",
    );
    expect(route).toBeTruthy();
    const plan = buildLiveRequestPlan(route!, {
      pathParams: { book_id: "654321" },
      dryRun: true,
    });
    expect(plan.url).toBe("https://www.goodreads.com/notes/654321/share");
    expect(plan.execute).toBe(false);
    expect(plan.requiresCookie).toBe(true);
    expect(riskLevelForRoute(route!)).toBe("write-mutate");
  });

  it("defaults mapped mutations to dry-run and requires explicit execution", async () => {
    const routes = await loadApiMapRoutes();
    const mutation = routes.find((candidate) => candidate.path === "/notes/{book_id}/share");
    const read = routes.find(
      (candidate) => candidate.method === "GET" && candidate.path === "/book/show/{book_slug}",
    );
    expect(mutation).toBeTruthy();
    expect(read).toBeTruthy();

    const safeDefault = buildLiveRequestPlan(mutation!, { pathParams: { book_id: "654321" } });
    expect(safeDefault).toMatchObject({ execute: false, dryRun: true, mutatesAccount: true });

    const explicitWrite = buildLiveRequestPlan(mutation!, {
      pathParams: { book_id: "654321" },
      execute: true,
    });
    expect(explicitWrite).toMatchObject({ execute: true, dryRun: false, mutatesAccount: true });

    const forcedDryRun = buildLiveRequestPlan(mutation!, {
      pathParams: { book_id: "654321" },
      execute: true,
      dryRun: true,
    });
    expect(forcedDryRun).toMatchObject({ execute: false, dryRun: true });

    const liveRead = buildLiveRequestPlan(read!, { pathParams: { book_slug: "654321-example" } });
    expect(liveRead).toMatchObject({ execute: true, dryRun: false, mutatesAccount: false });
  });

  it("maps the quote write surface (add/remove/reorder) as mutating routes", async () => {
    const routes = await loadApiMapRoutes();
    const byPath = (method: string, path: string) =>
      routes.find((r) => r.method === method && r.path === path);

    const create = byPath("POST", "/quotes");
    const remove = byPath("POST", "/quotes/{quote_slug}/remove");
    const moveUp = byPath("POST", "/quotes/move_up/{quote_id}");
    const reorder = byPath("POST", "/quotes/update_positions");
    for (const route of [create, remove, moveUp, reorder]) {
      expect(route).toBeTruthy();
      expect(route!.mutatesAccount).toBe(true);
      expect(riskLevelForRoute(route!)).toBe("write-mutate");
    }
    // GET /quotes/new is the add form, not a mutation.
    expect(byPath("GET", "/quotes/new")?.mutatesAccount).toBe(false);

    const plan = buildLiveRequestPlan(moveUp!, {
      pathParams: { quote_id: "105273908" },
      dryRun: true,
    });
    expect(plan.url).toBe("https://www.goodreads.com/quotes/move_up/105273908");
    expect(plan.requiresCsrf).toBe(true);
  });

  it("maps canonical /search and unfriend routes discovered in the hardening pass", async () => {
    const routes = await loadApiMapRoutes();
    expect(routes.find((r) => r.method === "GET" && r.path === "/search")).toBeTruthy();
    const destroy = routes.find(
      (r) => r.method === "POST" && r.path === "/friend/destroy/{friend_id}",
    );
    expect(destroy?.mutatesAccount).toBe(true);
  });

  it("maps the authenticated browser discoveries through the shared CLI route engine", async () => {
    const routes = await loadApiMapRoutes();
    const has = (method: string, path: string) =>
      routes.some((route) => route.method === method && route.path === path);

    expect(has("POST", "/user_not_interested_works")).toBe(true);
    expect(has("GET", "/amazon_purchases/books")).toBe(true);
    expect(has("HEAD", "/review_porter/export/{user_id}/goodreads_export.csv")).toBe(true);
    expect(has("PUT", "/notes/{book_id}/{annotation_pair_id}")).toBe(true);
    expect(has("DELETE", "/notes/{book_id}/{annotation_pair_id}")).toBe(true);
    for (const method of ["POST", "PUT", "DELETE"]) {
      expect(has(method, "/notes/{book_id}/{annotation_pair_id}/note")).toBe(true);
    }
    expect(routes.some((route) => route.path.endsWith("/visibility"))).toBe(false);
    expect(routes.some((route) => route.path.endsWith("/spoiler"))).toBe(false);

    const purchaseSearch = searchApiRoutes(routes, "Amazon purchase books", 10);
    expect(purchaseSearch.map((route) => route.path)).toContain("/amazon_purchases/books");
    const noteSearch = searchApiRoutes(routes, "update annotation spoiler visibility", 10);
    expect(noteSearch.map((route) => route.path)).toContain(
      "/notes/{book_id}/{annotation_pair_id}",
    );
  });

  it("makes AppSync operations searchable without enabling generic execution", async () => {
    const operations = await loadGraphqlCatalogRoutes();
    const similar = searchApiRoutes(operations, "GraphQL similar books", 5)[0];
    const rate = searchApiRoutes(operations, "set star rating", 5)[0];

    expect(similar).toMatchObject({
      method: "GRAPHQL_QUERY",
      path: "/graphql#getSimilarBooks",
      executable: false,
      transport: "appsync-graphql",
    });
    expect(rate).toMatchObject({
      method: "GRAPHQL_MUTATION",
      path: "/graphql#RateBook",
      mutatesAccount: true,
      requiresApproval: true,
      executable: false,
    });
  });

  it("joins recent shelf rows to notes links without raw highlight text", async () => {
    const dir = await mkdtemp(join(tmpdir(), "goodreads-recent-"));
    await writeFile(
      join(dir, "shelf-read.html"),
      `
        <html><head><title>Reader's 'read' books on Goodreads (1 book)</title></head>
        <body>
          <a href="/review/list/current-user?shelf=read">Read (1)</a>
          <table id="booksBody">
            <tr id="review_111">
              <td><input type="checkbox" name="reviews[111]" value="111"></td>
              <td><a href="/book/show/123-example-book">Example Book</a></td>
            </tr>
          </table>
        </body></html>
      `,
    );
    await writeFile(
      join(dir, "notes-index.html"),
      `
        <html><body>
          <a href="/notes/123-example-book/current-user">View notes for Example Book</a>
          <span class="highlightText">This private highlight must not leak.</span>
        </body></html>
      `,
    );

    const joined = await buildRecentReadingNotes({ fixtureDir: dir, shelves: ["read"], limit: 10 });
    expect(joined.books[0]?.notes.hasNotesIndexMatch).toBe(true);
    expect(joined.books[0]?.notes.notesBookSlug).toBe("123-example-book");
    expect(JSON.stringify(joined)).not.toContain("This private highlight");
  });

  it("requires exact approval gates for notes publicizing", () => {
    expect(
      checkPublicizeApproval({
        bookId: "123",
        approvedBookIds: [],
        execute: false,
        env: {},
      }).blockers,
    ).toContain("--execute is required for live notes publicizing");
    expect(
      checkPublicizeApproval({
        bookId: "123",
        approvedBookIds: ["123"],
        execute: true,
        env: { GOODREADS_ALLOW_NOTES_PUBLICIZE: "1" },
      }).blockers,
    ).toHaveLength(0);
  });

  it("parses discovery cards as book metadata without prose or image URLs", () => {
    const search = parseSearchResultsPage(`
      <div class="searchSubNavContainer">showing 1-20 of 20 books</div>
      <tr><a class="bookTitle" href="/book/show/123-example?from_search=true">Example Book</a>
      <a class="authorName">Example Author</a><span class="minirating">4.2 avg rating</span>
      <div class="reviewText">Private review prose must never be returned.</div></tr>
    `);
    const recommendations = parseRecommendationsPage(`
      <div class="bookBox"><a href="/book/show/456-recommended"><img alt="Recommended Book"></a>
      <p>Personal recommendation explanation must never be returned.</p></div>
    `);
    const author = parseAuthorPage(`
      <h1 class="authorName">Example Author</h1><div class="aboutAuthorInfo">Long biography prose.</div>
      <div class="elementList"><a class="bookTitle" href="/book/show/789-bibliography">Bibliography Book</a>
      <span class="minirating">4.0 avg rating</span></div>
    `);

    expect(search).toMatchObject({
      resultCountLabel: "showing 1-20 of 20 books",
      books: [{ bookId: "123", title: "Example Book", author: "Example Author" }],
    });
    expect(recommendations.books).toEqual([
      { bookId: "456", title: "Recommended Book", author: null, ratingSummary: null },
    ]);
    expect(author).toMatchObject({
      name: "Example Author",
      bioLength: "Long biography prose.".length,
      books: [{ bookId: "789", title: "Bibliography Book" }],
    });
    const serialized = JSON.stringify({ search, recommendations, author });
    expect(serialized).not.toContain("Private review prose");
    expect(serialized).not.toContain("Personal recommendation explanation");
    expect(serialized).not.toContain("Long biography prose");
  });

  it("parses similar-book React props, excludes the source work, and drops private prose", () => {
    const parsed = parseSimilarBooksPage(`
      <h1>Readers who enjoyed</h1>
      <div data-react-class="ReactComponents.Breadcrumbs"
        data-react-props='{"pageLinks":[{"text":"Source Author","url":"/author/show/1.Source"},{"text":"Source Book","url":"/book/show/100.Source_Book"},{"text":"Similar books"}]}'></div>
      <div data-react-class="ReactComponents.SimilarBooksList"
        data-react-props='{"similarBooks":[{"book":{"bookId":"100","workId":"10","bookUrl":"/book/show/100.Source_Book","title":"Source Book","avgRating":4.1,"ratingsCount":100,"author":{"name":"Source Author"},"description":{"truncatedHtml":"source prose"},"imageUrl":"secret-image"}}]}'></div>
      <div data-react-class="ReactComponents.SimilarBooksList"
        data-react-props='{"similarBooks":[{"book":{"bookId":"200","workId":"20","bookUrl":"/book/show/200.First","title":"First Similar","numPages":320,"avgRating":4.2,"ratingsCount":200,"author":{"name":"First Author"},"description":{"truncatedHtml":"private prose"},"imageUrl":"secret-image"}},{"book":{"bookId":"201","workId":"21","bookUrl":"/book/show/201.Second","bookTitleBare":"Second Similar","avgRating":3.9,"ratingsCount":50,"author":{"name":"Second Author"}}}]}'></div>
      <div data-react-class="ReactComponents.SimilarBooksList"
        data-react-props='{"similarBooks":[{"book":{"bookId":"200","workId":"20","bookUrl":"/book/show/200.First","title":"First Similar","author":{"name":"First Author"}}}]}'></div>
    `);

    expect(parsed).toMatchObject({
      kind: "similar_books",
      source: { bookId: "100", workId: "10", title: "Source Book", author: "Source Author" },
      books: [
        {
          bookId: "200",
          workId: "20",
          title: "First Similar",
          author: "First Author",
          avgRating: 4.2,
          ratingsCount: 200,
          numPages: 320,
        },
        {
          bookId: "201",
          workId: "21",
          title: "Second Similar",
          author: "Second Author",
        },
      ],
    });
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain("private prose");
    expect(serialized).not.toContain("source prose");
    expect(serialized).not.toContain("secret-image");
  });

  it("loads sanitized authenticated browser route templates", async () => {
    const routes = await loadBrowserRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(10);
    expect(routes.map((route) => route.path_template)).toContain("/review/list/{id}");
    expect(JSON.stringify(routes)).not.toMatch(
      /Cookie|Authorization|csrf-token|localStorage|sessionStorage/i,
    );
  });
});
