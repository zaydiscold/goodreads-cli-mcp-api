# Goodreads Current API Sweep

> **Historical research snapshot.** Do not use its “future” or “dry-run only”
> statements as current product truth. See [`../README.md`](../README.md) and
> [`../docs/write-operations.md`](../docs/write-operations.md).

Generated: 2026-05-22T09:20:00Z

## Scope

This pass was intentionally external-first, then corroborated against the logged-in browser session. The goal was to avoid confirmation bias from only clicking around Goodreads.

Inputs used:

- 30-day web search for Goodreads API/scraper/RSS/shelf material.
- X/Twitter search through `bird`.
- GitHub repository and code search, then targeted repo-content reads after GitHub code search rate-limited.
- Public Goodreads endpoint probes with `curl`.
- Logged-in Goodreads DOM/script captures with `browser-harness-js`.

`last30days` was requested conceptually, but the CLI is not installed on PATH in this shell. I substituted web recency search, Bird search, and GitHub `pushed:>2026-04-22` searches and recorded that gap.

No account mutation was performed in this sweep.

## High-Confidence Findings

### 1. There is no current official public Goodreads API path

Current public developer discussion still points to the 2020 API retirement/new-key shutdown. Modern implementations are using one of:

- shelf RSS feeds;
- HTML parsing;
- Next.js/Apollo state extraction from book pages;
- commercial scraper APIs;
- old XML API routes only when someone still has old credentials.

External evidence:

- Sadman Hossain's 2025 Astro writeup explicitly treats Goodreads RSS as the practical alternative to the retired API and documents shelf URL construction: `https://sadman.ca/blog/how-to-use-goodreads-data-in-astro/`.
- Apify markets a Goodreads scraper API because no official one exposes the desired book/review data: `https://apify.com/epctex/goodreads-scraper/api`.
- Bright Data markets a Goodreads scraper API with review IDs, bookshelves, reading progress, and reviewer metadata: `https://brightdata.com/products/web-scraper/goodreads`.

### 2. Shelf RSS is the cleanest public read API for user books

Pattern:

```text
GET /review/list_rss/:user_id?shelf=:shelf
```

The slug suffix is optional; the numeric user id is enough.

Confirmed live:

```bash
curl -I 'https://www.goodreads.com/review/list_rss/179929687?shelf=read'
```

returned `200` and `content-type: application/xml`. A body sample exposed structured XML fields including:

- `book_id`
- `book_image_url`, `book_small_image_url`, `book_medium_image_url`, `book_large_image_url`
- `book_description`
- `author_name`
- `isbn`
- `user_name`
- `user_rating`
- `user_read_at`
- `user_date_added`
- `user_date_created`
- `user_shelves`
- `user_review`
- `average_rating`
- `book_published`

RSS caveats from external Goodreads developer discussion:

- Public shelf RSS appears capped at 100 items. Live local count checks returned 40 `<item>` entries for the 40-book `read` shelf and 100 `<item>` entries for the 132-book `to-read` shelf.
- RSS sorting historically defaulted to `updated_at`.
- `sort` can be passed, but old discussion reports order/reverse-order inconsistencies around shelves larger than 100.
- Treat RSS as a robust public feed, not a full-fidelity private export.

Important local nuance:

- The authenticated shelf page contains a `link rel="alternate"` RSS URL with a private `key=` parameter. Do not log or commit that key. Use the public numeric RSS URL first, and only support keyed RSS through a redacted local config if needed later.

### 3. Legacy XML API routes still exist but reject unauthenticated/no-key calls

Observed with `curl`:

```text
GET /review/list.xml?v=2&id=179929687&shelf=read&page=1&per_page=50&sort=position
GET /shelf/list.xml?user_id=179929687&page=1
```

Both returned `401` and body text `Invalid API key.` without credentials.

Historical GitHub code and old Goodreads developer threads point to:

```text
GET  /review/list.xml?v=2&id=:user_id&shelf=:shelf&page=:page&per_page=:n&sort=:sort
GET  /shelf/list.xml?user_id=:user_id&page=:page
POST /shelf/add_to_shelf.xml
POST /shelf/add_books_to_shelves.xml
```

These are useful for schema hints, but they are not the right implementation default unless a user already has a working old API key/OAuth token.

### 4. Logged-in shelf movement is now mapped enough for dry-run plans

Current local proof artifacts:

```text
goodreads/proofs/bookshelves-read-move-map-2026-05-22.json
goodreads/proofs/bookshelf-edit-popover-map-2026-05-22-v2.json
goodreads/proofs/bookshelf-script-routes-2026-05-22.json
```

Current shelf names/counts from the logged-in table page:

```text
All: 28
to-read: 132
currently-reading: 7
read: 40
did-not-finish: 6
for-the-aesthetic: 2
want-to-read-again: 2
```

These are the current account's discovered shelf inventory, not a global enum. A future CLI should run shelf discovery first and should treat common shelves as aliases only if they exist in the current account inventory.

Main bookshelf pagination is required for full export. Fixture-backed parsing later proved:

```text
read: declared 40, pages 1-2 parsed 40 unique review ids
to-read: declared 132, pages 1-5 parsed 132 unique review ids
```

Batch shelf form:

```text
POST /review/update_list/179929687
```

Key fields:

```text
authenticity_token
view=table
edit[shelf]=to-read|currently-reading|read|did-not-finish|for-the-aesthetic|want-to-read-again
reviews[<review_id>]=<review_id>
```

Script-discovered endpoints:

```text
POST /shelf/add_to_shelf
POST /shelf/remove_book
POST /shelf/move_batch
POST /shelf/move_batch/:user_id
POST /shelf/move_to_position/
POST /review/update/:book_id
POST /review/update_list/:user_id
POST /review/update_session_shelf_settings
```

Single-book row shelf chooser:

```js
window.shelfChooser.summon(event, { bookId: 9656394, chosen: ["currently-reading"] });
```

`ShelfChooser.submitShelf()` sends:

```text
POST /shelf/add_to_shelf
params: book_id, name, a
```

where `a=remove` is used for removal. The generated helper also uses `/shelf/remove_book` for want-to-read button toggles.

Safety status:

- Batch and single-book shelf mutation routes are mapped.
- No shelf mutation was submitted in this sweep.
- Future CLI should expose `books move --dry-run` before any `--execute`.

### 5. Book pages have a better public map than old scrapers usually use

Modern book pages are Next.js-backed and include:

- `script type="application/ld+json"` with schema.org `Book` fields.
- `script id="__NEXT_DATA__"` with a large Apollo cache containing book, contributor, review, shelf/tagging, and user references.
- Stable-ish DOM selectors also used by current scraper projects: `data-testid="bookTitle"`, `RatingStatistics__rating`, `data-testid="ratingsCount"`, `data-testid="reviewsCount"`, `data-testid="description"`, `data-testid="genresList"`.

Live corroboration:

```text
GET /book/show/57905101-the-gate-of-the-feral-gods
```

returned JSON-LD and a large `__NEXT_DATA__` payload. Because `__NEXT_DATA__` embeds public review text and many users, do not store raw bodies by default. Extract only normalized fields into fixtures.

### 6. Search has an OpenSearch descriptor

Observed:

```text
GET /opensearch.xml
```

Search template:

```text
GET /search/search?search_type=books&search[query]={searchTerms}
```

This is cleaner than guessing the header form fields.

### 7. People, discovery, message, shelf, and genre indexes are route-mapped

Current local proof:

```text
goodreads/proofs/discovery-pages-map-2026-05-22.json
```

Mapped pages:

```text
GET /amazon_purchases?source=bb
GET /shelf
GET /shelf/show/:shelf_slug
GET /genres/list
GET /genres/search?shelf=:query
GET /genres/:genre_slug
GET /user/best_reviewers
GET /user/top_readers
GET /user/top_reviewers
GET /user_following/most_followed
GET /message/inbox
GET /message/saved
GET /message/sent
GET /message/trash
GET /message/show/:message_id
POST /message/move_batch?page=:page
GET /message/mark_all_as_read
```

Message writes remain dry-run only. The inbox form has `move[folder]` options `saved`, `trash`, and `mark as read`, plus `messages[<id>]` checkboxes and an `authenticity_token`.

## Lower-Confidence External Hints

### `ekamid/goodreads-scraper-api`

Repo: `https://github.com/ekamid/goodreads-scraper-api`

Why it matters:

- Updated 2026-05-20.
- TypeScript/Next app with Cheerio-based Goodreads scrapers.
- Useful selectors for current book and author pages.

Important caveat:

- README/docs advertise endpoints like `/api/search`, `/api/lists`, `/api/users/:username/shelves`, `/api/book/details/:slug/reviews`, and `/api/quotes`.
- The current route tree I inspected only showed implemented route files for:
  - `/api/book/details/:slug`
  - `/api/author/details/:slug`
  - `/api/author/books/:slug`
- Treat the advertised endpoints as product intent unless route files are verified.

### Commercial APIs

Apify and Bright Data confirm that the commercial market sees public Goodreads scraping as viable, and they expose OpenAPI/MCP/API wrappers. These are useful for schema comparison and fallback outsourcing, but they do not solve account-authenticated private actions like moving a book between the user's shelves or publicizing Kindle notes.

### X/Twitter signal

Bird search found 2026 posts saying the Goodreads API is deprecated and recommending RSS feeds. Exact searches for `Goodreads Scraper API` and `goodreads.com/shelf/add_to_shelf` returned no recent tweets. This suggests the durable current patterns are RSS and scraping, not a widely-discussed new hidden official API.

## Whole-Map Discovery Tricks

Use these in order:

1. `robots.txt` and `siteindex.*.xml` for broad public route families.
2. `opensearch.xml` for canonical search route shape.
3. Logged-in page `link rel="alternate"` tags for RSS feed discovery, with private keys redacted.
4. Public shelf RSS route generation: `/review/list_rss/:user_id?shelf=:shelf`.
5. Static JS asset mining, especially `application-*.js` and `review/list-*.js`, for hidden XHR/write route strings.
6. Inline event handler extraction from shelf table pages for `bookId`, `review_id`, `chosen` shelf arrays, and `review/destroy` routes.
7. Next.js book page extraction from JSON-LD plus `__NEXT_DATA__`.
8. GitHub code search for old route strings as historical hints, not proof of current support.
9. Commercial scraper docs for schema comparison.
10. Authenticated DOM/form capture for private/account-specific writes.

## Implementation Recommendation

Build the Goodreads CLI in three confidence lanes:

1. Public read lane:
   - shelf RSS;
   - book JSON-LD;
   - book `__NEXT_DATA__` normalized extraction;
   - public shelf/genre/people/list pages.

2. Authenticated read lane:
   - `/review/list/:user`;
   - `/tooltips`;
   - notes/highlights;
   - profile/social/message pages.

3. Approval-gated write lane:
   - notes publicize (`PUT /notes/:book_id/share`) because it has already been approved and verified for pasted pages;
   - shelf moves/add/remove (`/review/update_list`, `/shelf/add_to_shelf`, `/shelf/remove_book`) as dry-run only until a dedicated approval capture;
   - message actions dry-run only.

Do not scaffold the PP package until parser fixtures exist for the first two lanes.
