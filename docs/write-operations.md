# Write Operations

The personal Goodreads CLI is live read/write capable. It is not PP-side
software. Reads run live; every mutating route defaults to a dry-run plan.

## Runtime Contract

- `goodreads-cli request execute` runs reads live and plans mutations by default.
- Generic mutations require `--execute`, exact `--approved-route`, and `GOODREADS_ALLOW_GENERIC_WRITES=1`.
- `--dry-run` forces a preview even when execution flags are present.
- Mutating routes print `[WRITES TO LIVE GOODREADS]` to stderr before execution.
- Authenticated writes require caller-owned `GOODREADS_COOKIE`.
- Rails-form writes require `GOODREADS_CSRF_TOKEN` or a current form `authenticity_token`.
- `goodreads-cli notes publicize` and `goodreads-cli recent-reading publicize` require `--execute`, an exact `--approved-book-id`, and `GOODREADS_ALLOW_NOTES_PUBLICIZE=1`.
- Notes publicize writes use numeric `book_id`; reload verification uses `/notes/{book_slug}/{user_slug}` from the notes link.

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
GOODREADS_COOKIE='<cookie-header>' GOODREADS_CSRF_TOKEN='<token>' \
  GOODREADS_ALLOW_GENERIC_WRITES=1 goodreads-cli request execute \
  --route "PUT /notes/{book_id}/share" \
  --approved-route "PUT /notes/{book_id}/share" \
  --param book_id=<book-id> --form visible=true --execute
GOODREADS_ALLOW_NOTES_PUBLICIZE=1 GOODREADS_COOKIE='<cookie-header>' GOODREADS_CSRF_TOKEN='<token>' \
  goodreads-cli notes publicize --book-id <book-id> --approved-book-id <book-id> --execute
goodreads-cli notes publicize-plan --book-id <book-id> --book-slug <book-slug> --user-slug <user-slug> --approved-book-id <book-id>
```

An accepted HTTP response is not verification. After a live mutation, reload
the relevant Goodreads page and verify the account-visible state before
claiming success.
