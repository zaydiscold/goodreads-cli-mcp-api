# Write Operations

The personal Goodreads CLI is live read/write capable. It is not PP-side
software. Reads run live; every mutating route defaults to a dry-run plan.

**One cookie session drives every write.** Notes, shelves, quotes, and generic
route execute all use `GOODREADS_COOKIE`. CSRF is refreshed from that cookie
before each live Rails mutation — you do not maintain a second login.

## Runtime Contract

- `goodreads-cli request execute` runs reads live and plans mutations by default.
- Generic mutations require `--execute`, exact `--approved-route`, and `GOODREADS_ALLOW_GENERIC_WRITES=1`.
- `--dry-run` forces a preview even when execution flags are present.
- Mutating routes print `[WRITES TO LIVE GOODREADS]` to stderr before execution.
- Authenticated writes require caller-owned `GOODREADS_COOKIE`.
- Rails-form writes auto-refresh CSRF from the signed-in `/review/list` page (or accept form `authenticity_token`). The public homepage is intentionally not used because it can return a WAF challenge while account pages remain authenticated.
- Live mutations always send browser-like `Referer` and `Origin` headers:
  - `Referer: https://www.goodreads.com/`
  - `Origin: https://www.goodreads.com`
- Shelf, rating, notes, and quote helpers additionally send
  `X-Requested-With: XMLHttpRequest`. `/review/update/{book_id}` and `/quotes`
  intentionally do not: they are normal Rails forms returning trusted `302`
  redirects, and forcing XHR semantics causes HTTP 500.
- Same-origin redirects to `/user/sign_in` or `/user/new` are authentication
  failures, not accepted writes.
- `goodreads-cli notes publicize` and `goodreads-cli recent-reading publicize` require `--execute`, an exact `--approved-book-id`, and `GOODREADS_ALLOW_NOTES_PUBLICIZE=1`.
- Notes publicize writes use numeric `book_id`; reload verification uses `/notes/{book_slug}/{user_slug}` from the notes link.
- `goodreads-cli shelves add` / `shelves remove` (MCP: `goodreads_shelf_add` / `goodreads_shelf_remove`) require `--execute` and drive `POST /shelf/add_to_shelf`.
- `goodreads-cli library rating` uses `POST /review/rate/{book_id}`; `library review` and status updates use the normal Rails review form at `POST /review/update/{book_id}`. Verification comes from authenticated `/review/edit/{book_id}`, not RSS.
- Quote creation uses the normal Rails `POST /quotes` form. Remove/reorder use their dedicated mapped routes; verify against `/quotes/list/{user_slug}`, not the generic `/quotes/list` discovery page.

## Shelf add / remove (want-to-read)

Canonical exclusive shelves: `to-read` (Want to Read), `currently-reading`, `read`.

```bash
source ~/.goodreads/auth.sh

# Dry-run plan (default)
goodreads-cli shelves add --book-id 58169 --name to-read

# Live add
goodreads-cli shelves add --book-id 58169 --name to-read --execute

# Live remove
goodreads-cli shelves remove --book-id 58169 --name to-read --execute
```

Form fields (fire-tested 2026-06-08, re-verified 2026-07-27):

```text
POST /shelf/add_to_shelf
authenticity_token=<fresh CSRF from cookie>
book_id=<numeric book id>
name=to-read|currently-reading|read|<custom-shelf>
a=          # empty = add
a=remove    # remove from exclusive shelf
```

**Wrong book_id** returns HTTP 404 with body `Sorry, we couldn't find that book.`
That is not an auth problem — resolve the numeric id (editions pages work when
`/book/show/{id}` is bot-walled with 202).

Verify membership after a write with authenticated account state. RSS is a public fallback and may be capped or stale; it is not the primary immediate write verifier:

```bash
curl -s -b "$GOODREADS_COOKIE" \
  "https://www.goodreads.com/review/edit/<book-id>"
```

## Risk Levels

The CLI uses the shared risk enum:

- `read` for routes that only inspect pages, RSS, or local maps.
- `write-safe` reserved for idempotent or additive account actions.
- `write-mutate` for POST/PUT/PATCH account mutations such as notes publicizing, shelf edits, and message state changes.
- `write-destructive` for DELETE routes if mapped later.

## Examples

```bash
goodreads-cli request plan --route "PUT /notes/{book_id}/share" --param book_id=<book-id>
goodreads-cli request execute --route "PUT /notes/{book_id}/share" --param book_id=<book-id> --dry-run
GOODREADS_COOKIE='<cookie-header>' \
  GOODREADS_ALLOW_GENERIC_WRITES=1 goodreads-cli request execute \
  --route "PUT /notes/{book_id}/share" \
  --approved-route "PUT /notes/{book_id}/share" \
  --param book_id=<book-id> --form visible=true --execute
GOODREADS_ALLOW_NOTES_PUBLICIZE=1 GOODREADS_COOKIE='<cookie-header>' \
  goodreads-cli notes publicize --book-id <book-id> --approved-book-id <book-id> --execute
goodreads-cli notes publicize-plan --book-id <book-id> --book-slug <book-slug> --user-slug <user-slug> --approved-book-id <book-id>
goodreads-cli shelves add --book-id <book-id> --name to-read --execute
```

An accepted HTTP response is not verification. After a live mutation, reload
the relevant Goodreads page (or RSS) and verify the account-visible state before
claiming success. Envelope fields: `requestAccepted` vs `mutationVerified`
(always false until an independent read proves state).

## Current live evidence (2026-08-08)

Reversible account tests passed and were restored: shelf status, rating, review
text, quote create/remove, quote reorder, and notes visibility. The exact cycles
and verifier surfaces are recorded in the root README. Historical capture docs
describe what was known at their evidence date; they do not override this current
runtime contract.
