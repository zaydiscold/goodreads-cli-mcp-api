# goodreads-cli

I wanted to run my entire Goodreads life from the terminal (and from my agents) — shelve a book, rate it, fire off a review, enter a giveaway, log reading progress — without ever opening the website. Amazon killed the public Goodreads API for new keys back in December 2020, so there was nothing to call. So I sat down, mapped the whole logged-in surface myself with CDP capture, and built this on top of the map.

It's a TypeScript CLI plus an MCP server, both driving the same hand-mapped API. The map is the headline; the CLI and MCP are just the proof that the map is real and complete enough to drive.

## What it does

Full read **and** write across Goodreads:

- **Shelves** — add a book to a shelf, create custom shelves, rename/edit, reorder items.
- **Ratings** — set and clear star ratings through the modern AppSync **GraphQL** ops (`RateBook` / `UnrateBook`), not the legacy form path.
- **Reviews** — write and edit reviews, publicize them, and flag spoilers; bulk-edit and delete too.
- **Friends** — add and remove friends, send invites.
- **Groups** — browse and create groups.
- **Listopia lists** — read lists and create your own.
- **Reading challenges** — pull goals, quests, and achievement data.
- **Kindle Notes & Highlights** — read your notes per book, paginated.
- **Recent-reading notes workflows** — join current/read shelves to Kindle notes visibility, plan publicizing, and keep raw highlight text private.
- **Comments and annotations** — inspect route/metadata shape without emitting raw comment bodies or highlight text.
- **Quotes** — add, remove, and reorder quotes (up/down/top/bottom).
- **Recommendations** — yours and friends'.
- **Genre / topic search** — genres, topics, discussions.
- **Giveaways** — browse and enter (including Kindle giveaways).
- **Home feed** — post a status, update reading progress, and comment.

Most workflow commands default to **dry-run** — they print the exact request they would send and stop. The low-level `request execute` command is intentionally live-capable by default for mapped routes, so pass `--dry-run` when previewing it. The notes/highlights publicize workflow is stricter: it requires `--execute`, an exact `--approved-book-id`, `GOODREADS_ALLOW_NOTES_PUBLICIZE=1`, and caller-owned session inputs before it will submit.

## Recent Reading And Notes

```bash
goodreads-cli recent-reading list --fixture-dir <private-fixtures> --shelves currently-reading,read --limit 25 --json
goodreads-cli recent-reading notes --fixture-dir <private-fixtures> --notes-index-fixture <notes-index.html> --json
goodreads-cli recent-reading publicize-plan --fixture-dir <private-fixtures> --approved-book-id <book-id> --json
goodreads-cli notes publicize-plan --book-id <book-id> --book-slug <book-slug> --user-slug <user-slug> --detail-fixture <notes-detail.html> --approved-book-id <book-id> --json
GOODREADS_ALLOW_NOTES_PUBLICIZE=1 goodreads-cli notes publicize --book-id <book-id> --approved-book-id <book-id> --execute --json
```

These commands never emit raw Kindle highlight text. The write route uses numeric `book_id`; reload verification uses `/notes/{book_slug}/{user_slug}` from the notes link. Public proof should include only counts, status, timing, and redacted route shape.

## Example: Agent-Driven Notes Publicizing

Here's what it looks like when you ask an AI agent (Claude, Codex, Hermes, etc.) to make all your Goodreads Kindle notes and highlights public. The agent uses this CLI to discover books, check visibility, build a plan, and execute — all without touching a browser.

### 1. Discover the route

The agent searches the API map for notes capabilities:

```bash
$ goodreads-cli api-map search notes
```

```json
{
  "routeCount": 6,
  "routes": [
    { "id": "get_notes-book-slug-user-slug", "method": "GET",  "path": "/notes/{book_slug}/{user_slug}" },
    { "id": "get_notes-user-slug",            "method": "GET",  "path": "/notes/{user_slug}" },
    { "id": "get_notes-user-id-load-more",    "method": "GET",  "path": "/notes/{user_id}/load_more" },
    { "id": "put_notes-book-id-share",        "method": "PUT",  "path": "/notes/{book_id}/share",
      "summary": "Bulk publicize notes/highlights for a book." }
  ]
}
```

### 2. Inventory your books with hidden notes

Save your shelf and notes HTML pages as fixtures (one-time browser export), then run:

```bash
$ goodreads-cli recent-reading publicize-plan \
    --fixture-dir ./fixtures \
    --shelves currently-reading,read \
    --json
```

This joins your shelf books to your Kindle notes index and produces a per-book publicize plan. Every book with notes gets a `route`, `verifyRoute`, and `executeGate` block. Books with already-visible notes show `action: "noop-already-public"`.

### 3. Check one book before acting

```bash
$ goodreads-cli notes publicize-plan \
    --book-id 218134959 \
    --book-slug 218134959-mr-whisper \
    --user-slug zaydk \
    --detail-fixture ./fixtures/notes-218134959.html \
    --approved-book-id 218134959 \
    --json
```

```json
{
  "data": {
    "bookId": "218134959",
    "bookSlug": "218134959-mr-whisper",
    "method": "PUT",
    "route": "/notes/218134959/share",
    "verifyRoute": "/notes/218134959-mr-whisper/zaydk",
    "detail": {
      "noteCount": 47,
      "visibleNoteCount": 0,
      "hiddenNoteCount": 47,
      "alreadyFullyVisible": false
    },
    "action": "publicize-notes",
    "blockers": [],
    "workflowSteps": [
      "load notes detail page",
      "extract counts and visibility without highlight text",
      "stop if shelf gate appears",
      "require --execute, approved book id, and GOODREADS_ALLOW_NOTES_PUBLICIZE=1",
      "PUT /notes/{book_id}/share",
      "reload /notes/{book_slug}/{user_slug}",
      "verify visible count equals total count",
      "write sanitized proof"
    ]
  }
}
```

47 hidden highlights, 0 visible. The agent sees `action: "publicize-notes"` with no blockers — it's clear to proceed.

### 4. Dry-run first (always)

```bash
$ goodreads-cli notes publicize \
    --book-id 218134959 \
    --dry-run \
    --json
```

```json
{
  "data": {
    "approval": {
      "blockers": [
        "--execute is required for live notes publicizing",
        "--approved-book-id 218134959 is required",
        "GOODREADS_ALLOW_NOTES_PUBLICIZE=1 is required"
      ]
    },
    "requestPlan": {
      "method": "PUT",
      "url": "https://www.goodreads.com/notes/218134959/share",
      "mutatesAccount": true,
      "riskLevel": "write-mutate",
      "auth": { "cookieEnv": "GOODREADS_COOKIE", "csrfEnv": "GOODREADS_CSRF_TOKEN" }
    },
    "submitted": false
  }
}
```

The gates are explicit: `--execute`, `--approved-book-id`, and `GOODREADS_ALLOW_NOTES_PUBLICIZE=1`. The agent knows exactly what it's about to do before sending a single byte.

### 5. Execute with approval gates

```bash
$ GOODREADS_ALLOW_NOTES_PUBLICIZE=1 \
  GOODREADS_COOKIE="session-id=..." \
  GOODREADS_CSRF_TOKEN="abc123..." \
  goodreads-cli notes publicize \
    --book-id 218134959 \
    --approved-book-id 218134959 \
    --execute \
    --json
```

```json
{
  "data": {
    "submitted": true,
    "result": { "status": 200, "bodyShape": "text" },
    "verificationRequired": "Reload the notes detail page and verify visible count equals total note count before claiming success."
  }
}
```

### 6. Verify

The agent reloads `/notes/218134959-mr-whisper/zaydk`, parses the page, and confirms `visibleNoteCount === noteCount`. All 47 highlights are now public.

### The agent loop for a full library

For a complete library sweep, the agent would:

1. Run `recent-reading publicize-plan` to inventory all books with hidden notes
2. For each book where `action !== "noop-already-public"`:
   - Run `notes publicize-plan` with a detail fixture to confirm counts
   - Present the plan to the user for approval
   - Execute with `--execute` and the three gates
   - Reload and verify
3. Report: "Publicized 12 books (347 highlights made visible). 3 books already public. 0 failures."

The agent never emits raw highlight text, never leaks cookies or CSRF tokens in output, and every write is gated behind explicit approval — even when driven autonomously.

## The map is the point

The real artifact lives in [`api-map/`](./api-map/):

- An **OpenAPI 3.1** spec of the undocumented Goodreads web surface.
- **Per-endpoint Markdown** under [`api-map/markdown/`](./api-map/markdown/) — including the full read+write capture in [`full-surface-2026-05-28.md`](./api-map/markdown/full-surface-2026-05-28.md).
- A **curl** reference at [`api-map/curl/goodreads-web.sh`](./api-map/curl/goodreads-web.sh) so any of it is reproducible without this CLI.

It covers roughly **60 read routes** (HTML pages, RSS, and CSV exports), about **30 write endpoints** (Rails-UJS form POSTs captured from `data-remote` actions but never fired), and the **AppSync GraphQL** ops for the modern book/rating/feed widgets. Goodreads is a Rails app, so reads are mostly page routes, writes are form POSTs needing a CSRF token, and the newer surfaces speak GraphQL with a separate JWT.

## Extending it

Found an endpoint I missed? Add it to the OpenAPI spec and a Markdown page under `api-map/`, then wire a command in `cli/` (and an MCP tool in `mcp/` if agents should reach it). The map stays the source of truth — the commands are generated against it.

## Install

```bash
pnpm install
pnpm -r build
goodreads-cli --help
```

The MCP server runs with `goodreads-cli-mcp`.

---

Built on the trio pattern (CLI + skill + MCP) pioneered by [Matt Van Horn's Printing Press](https://github.com/mvanhorn/cli-printing-press).

Mapped & built by Zayd Khan ([@ColdCooks](https://twitter.com/ColdCooks) / [zaydiscold](https://github.com/zaydiscold)). MIT © Zayd Khan.
