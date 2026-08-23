# Goodreads CLI Command Contracts

Generated: 2026-05-22

## Contract Principles

- Discover account inventory first; never hardcode one user's shelves, folders, friends, lists, or page counts.
- Default to read commands where the command is observational; `request execute` is live by default and `--dry-run` is the preview mode.
- Treat RSS, HTML, JSON-LD, and `__NEXT_DATA__` as separate source lanes with confidence labels.
- Keep account-visible raw fixtures local/private.
- Every write route must expose a risk level and print a live-write warning before mutation.

## Shared Output Fields

Every command should include:

```json
{
  "source": "goodreads-web",
  "accountUserId": "<user-id-or-null>",
  "accountUserSlug": "<user-slug-or-null>",
  "generatedAt": "ISO-8601",
  "confidence": "high|medium|low",
  "warnings": []
}
```

For paginated collections:

```json
{
  "pagination": {
    "mode": "auto",
    "pagesSeen": [1, 2],
    "declaredCount": 40,
    "parsedCount": 40,
    "complete": true
  }
}
```

## `shelves discover`

Purpose: build the account-specific shelf inventory.

Primary source:

```text
GET /review/list/:user
```

Parser evidence:

```text
goodreads/fixtures/parsed/shelf-to-read.parsed.json -> shelfInventory
```

Output shape:

```json
{
  "shelves": [
    {
      "slug": "to-read",
      "displayName": "Want to Read",
      "count": 132,
      "href": "/review/list/<user-slug>?shelf=to-read",
      "kind": "account_shelf",
      "isObservedForThisAccount": true
    }
  ]
}
```

Rules:

- `to-read`, `currently-reading`, and `read` can be convenience aliases, but only after they appear in discovered inventory.
- Custom shelves such as `for-the-aesthetic` are first-class.
- `#ALL#` is an account all-books view, not a normal shelf write target.

## `books list --shelf <slug> --paginate auto`

Purpose: list books/reviews on one discovered shelf.

Primary source:

```text
GET /review/list/:user?shelf=:shelf
```

Fallback source:

```text
GET /review/list_rss/:user?shelf=:shelf
```

Rules:

- Use authenticated HTML for full export.
- Use RSS as public fallback and mark `complete=false` when item count is exactly 100 or below discovered shelf count.
- Follow `#reviewPagination` page links until all numbered pages have been parsed once.
- Deduplicate by `review_id` first, then `book_id`.
- Compare unique parsed review ids against discovered/declared shelf count.

Fixture proof:

```text
read: pages 1-2 -> 40 unique review ids, declared 40
to-read: pages 1-5 -> 132 unique review ids, declared 132
to-read RSS: 100 items, incomplete for full export
```

## `books export --all-shelves --paginate auto`

Purpose: export the account library.

Flow:

1. Run `shelves discover`.
2. For each discovered shelf except `#ALL#`, run `books list --shelf <slug> --paginate auto`.
3. Merge by `book_id` and retain all shelf memberships.
4. Report per-shelf completeness.

Output should include:

```json
{
  "books": [],
  "shelves": [],
  "perShelf": [
    {
      "shelf": "read",
      "complete": true,
      "parsedCount": 40,
      "declaredCount": 40
    }
  ]
}
```

## `book show <slug-or-id>`

Purpose: normalize one public book page.

Primary source:

```text
GET /book/show/:book_slug
```

Rules:

- Extract JSON-LD first.
- Extract `__NEXT_DATA__` only into normalized fields.
- Do not store raw public review bodies by default.

Fixture proof:

```text
goodreads/fixtures/parsed/book-gate-of-the-feral-gods.parsed.json
```

## Discovery reads

### `search books --query <query>`

Uses `GET /search?q=<query>&search_type=books` to return a bounded list of
candidate edition IDs, titles, author names, and rating summaries. It never
chooses a candidate on the caller's behalf and excludes descriptions, reviews,
and image URLs. A robot/challenge response is reported as low confidence, not
as an empty successful result.

### `recommendations list`

Uses authenticated `GET /recommendations` and returns recommendation-card book
metadata only. It requires a current `GOODREADS_COOKIE`; signed-out and
anti-bot states are explicit warnings. Do not expose recommendation explanations
or other account-private prose.

### `author show --author-slug <id.slug>`

Uses public `GET /author/show/:author_slug` and returns the author name, the
length of the rendered biography, and bounded bibliography metadata. It does
not return biography prose or book reviews.

## `notes list --paginate auto`

Purpose: list Kindle notes/highlights metadata without raw highlight text.

Primary sources:

```text
GET /notes/:user_slug
GET /notes/:user_id/load_more
```

Rules:

- Emit book-level note/highlight metadata.
- Do not emit raw highlight text by default.
- Detect load-more/pagination controls and follow them only for full export mode.

## `notes show --book <book_slug>`

Purpose: inspect visibility/state for a book's notes.

Primary source:

```text
GET /notes/:book_slug/:user_slug
```

Fixture proof:

```text
notes-mr-whisper: 12 notes, spoiler toggles present, no raw highlight text emitted
```

## `recent-reading`

Purpose: join currently-reading/read shelf rows to Kindle Notes & Highlights metadata.

Commands:

```text
recent-reading list --fixture-dir <private-fixtures> --shelves currently-reading,read --limit 25
recent-reading notes --fixture-dir <private-fixtures> --notes-index-fixture <notes-index.html>
recent-reading publicize-plan --fixture-dir <private-fixtures> --approved-book-id <book-id>
recent-reading publicize --book-id <book-id> --approved-book-id <book-id> --execute
notes publicize-plan --book-id <book-id> --book-slug <book-slug> --user-slug <user-slug> --approved-book-id <book-id>
```

Rules:

- `--fixture-dir` is required; there is no hardcoded account fixture default.
- Do not emit raw Kindle highlight text or raw comment bodies.
- `publicize-plan` never submits a Goodreads write.
- `publicize` submits only when `--execute`, exact `--approved-book-id`, and `GOODREADS_ALLOW_NOTES_PUBLICIZE=1` are all present.
- The mutation route uses numeric `book_id`; reload verification uses `/notes/{book_slug}/{user_slug}` from the notes link.
- After any approved write, reload the notes detail page and verify visible count equals total count before claiming success.

## `annotations` and `comments`

Purpose: map comments/annotations enough for agents to reason about notes and recent-reading activity without leaking raw text.

Rules:

- `annotations list` emits redacted annotation ids by default; `--include-private-ids` is private-local only.
- `annotations thoughts-plan` is plan-only until a separately approved capture proves payload and reload verification.
- `comments list --user-slug <slug>` reads the authenticated recent-post page live and emits only counts/link/form shape; fixtures remain supported and comment writes remain disabled.

## `messages folders`

Purpose: discover account message folders.

Primary source:

```text
GET /message/inbox
```

Observed folder routes:

```text
/message/inbox
/message/saved
/message/sent
/message/trash
```

Rules:

- Treat folder names as discovered account UI inventory.
- Do not mark messages read as part of discovery.

## `messages list --folder <folder> --paginate auto`

Purpose: list message metadata.

Primary source:

```text
GET /message/:folder
```

Rules:

- Emit message ids and structural metadata only by default.
- Do not emit sender labels, subjects, or bodies unless an explicit user-owned export mode is added.
- Check for pagination but do not exhaustively crawl unless requested.

## Write-Plan Commands

These write-plan commands produce dry-run plans:

```text
books move --book-id <id> --to-shelf <slug> --dry-run
shelves create --name <name> --dry-run
notes publicize --book-id <id> --dry-run
notes publicize-plan --book-id <id> --book-slug <book-slug> --user-slug <slug> --approved-book-id <id>
recent-reading publicize-plan --fixture-dir <private-fixtures> --approved-book-id <id>
messages move --message-id <id> --folder saved --dry-run
messages mark-read --message-id <id> --dry-run
```

Dry-run output must include:

- route;
- method;
- form/page source;
- CSRF requirement;
- target ids;
- verification URL;
- explicit warning that live execution mutates the account.

Generic `goodreads-cli request execute` is live-capable for mapped routes and has no `GOODREADS_ALLOW_WRITES` gate. It requires caller-owned auth (`GOODREADS_COOKIE` plus `GOODREADS_CSRF_TOKEN` or form authenticity token where needed), emits `[WRITES TO LIVE GOODREADS]` for mutating routes, and supports `--dry-run` for testing. Higher-level notes publicize workflow commands are stricter and require `GOODREADS_ALLOW_NOTES_PUBLICIZE=1`, `--execute`, and exact approved book ids. The notes publicize mutation uses numeric `book_id`; reload verification uses `/notes/{book_slug}/{user_slug}`.
