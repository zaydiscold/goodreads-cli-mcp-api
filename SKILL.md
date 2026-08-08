---
name: goodreads-cli
description: Complete Goodreads CLI + MCP — publicize/hide notes, add/remove shelves (want-to-read), extract auth via CDP, capture fixtures, cross-machine dispatch. Full read+write across the undocumented Goodreads web surface.
triggers:
  - "publicize my Goodreads notes"
  - "make Goodreads highlights public"
  - "Goodreads automation"
  - "wire goodreads MCP"
  - "goodreads-cli"
  - "extract Goodreads auth"
  - "goodreads shelf"
  - "add to want to read"
  - "add to to-read"
  - "hide Goodreads notes"
  - "fixture capture"
  - "cross-machine goodreads"
---

# Goodreads CLI + MCP

## Zero-thought path for small agents

For `add this book to Goodreads / want-to-read`:

1. Resolve one numeric Goodreads book ID; do not silently choose fuzzy duplicates.
2. `goodreads-cli shelves add --book-id ID --name to-read` (dry-run)
3. `goodreads-cli shelves add --book-id ID --name to-read --execute` (only when the user asked)
4. Verify membership with live authenticated My Books HTML or RSS; HTTP 200 alone is not proof.

A local EPUB/PDF belongs to `amazon-kindle-cli kindle send`, not Goodreads. An Amazon wishlist request belongs to `amazon-kindle-cli wishlist add`; wishlist membership is not Kindle ownership. Use CLI first and load browser/CDP only when ID resolution or persisted auth actually fails.

Drive your Goodreads account from the terminal. Amazon killed the public API in December 2020 — this CLI drives the undocumented web surface via a hand-mapped OpenAPI spec, CDP-captured routes, and live-verified write endpoints.

**Repo:** `zaydiscold/goodreads-cli-mcp-api` at `~/Desktop/clis and apis/goodreads-cli` (mothership) / `~/Desktop/CLIs/goodreads-cli` (frostbyte)
**Auth:** `~/.goodreads/auth.sh` (chmod 600, source before use) — **one cookie for every function**
**MCP:** `full`, `core`, and `notes` profiles over one shared engine (live truth: `tools/list`)
**Dev runbook:** [`AGENTS.md`](./AGENTS.md) — repo layout, build/test, the shared-engine + parity invariant

## 1. Auth Setup — one session, all writes

There is **no separate login** for notes vs shelves vs quotes. Same `GOODREADS_COOKIE`.

| Env                                 | Role                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `GOODREADS_COOKIE`                  | Durable browser session                                                          |
| `GOODREADS_CSRF_TOKEN`              | Optional bootstrap; **auto-refreshed from cookie before every live Rails write** |
| `GOODREADS_ALLOW_NOTES_PUBLICIZE=1` | Notes publicize/hide gate                                                        |
| `GOODREADS_ALLOW_GENERIC_WRITES=1`  | Generic `request execute` gate                                                   |

Live mutations always send `Referer` + `Origin` + `X-Requested-With`. Missing these → opaque HTTP 404 (not a second-login problem).

### Extract from Chrome via CDP (macOS)

```bash
# Copy logged-in cookies to debug profile
cp ~/Library/Application\ Support/Google/Chrome/Profile\ 1/Cookies \
   ~/Library/Application\ Support/chrome-debug/Default/Cookies

# Launch debug Chrome
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/Library/Application Support/chrome-debug" \
  --no-first-run --no-default-browser-check --remote-allow-origins=* &

# Extract via Python CDP (navigate to goodreads.com, get cookies + CSRF)
# Save to ~/.goodreads/auth.sh:
export GOODREADS_COOKIE='...'
export GOODREADS_CSRF_TOKEN='...'   # optional; CLI refreshes on write
export GOODREADS_ALLOW_NOTES_PUBLICIZE=1
chmod 600 ~/.goodreads/auth.sh
```

**Cookie quoting:** Goodreads cookies contain embedded double-quotes (`session-token="Mo5+..."`, `x-main="Ii1lsrN4..."`). Use Python's `shlex.quote()` for single-quote wrapping. Double-quote wrapping BREAKS silently.

### Transfer to mothership (Windows)

```bash
source ~/.goodreads/auth.sh
sed "s/^export /set \"/" ~/.goodreads/auth.sh | sed "s/='\(.*\)'/=\1\"/" > /tmp/auth.bat
echo "@echo off" | cat - /tmp/auth.bat > /tmp/t && mv /tmp/t /tmp/auth.bat
scp /tmp/auth.bat mothership:C:/Users/ZaydK/.goodreads/auth.bat
```

## 2. MCP Wiring

```bash
# Register this tracked wrapper with Hermes, Claude, and Codex. It loads the
# chmod-600 auth file at runtime and builds missing/stale artifacts without
# copying secrets into client configs.
~/Desktop/CLIs/goodreads-cli/scripts/goodreads-mcp.sh

# Optional lower-context profiles:
GOODREADS_MCP_PROFILE=core ~/Desktop/CLIs/goodreads-cli/scripts/goodreads-mcp.sh
GOODREADS_MCP_PROFILE=notes ~/Desktop/CLIs/goodreads-cli/scripts/goodreads-mcp.sh
```

The `full` profile exposes all legacy tools; `core` and `notes` reduce discovery cost while preserving the same tool implementations. All names are prefixed `goodreads_`:

- **Reads:** `api_map_routes`, `route_search`, `browser_routes`, `shelves_discover`, `books_list`, `books_export`, `book_show`, `search_books`, `recommendations_list`, `author_show`, `year_in_books`, `comments_list`, `messages_folders`, `messages_list`, `annotations_list`, `notes_inspect`, `notes_books`, `recent_reading_list`, `recent_reading_notes`, `library_show`, `dynamic_inventory_guidance`.
- **Plans (never submit):** `notes_publicize_plan`, `recent_reading_publicize_plan`, `annotations_thoughts_plan`, `bookshelf_move_plan`, `write_plan_notes_publicize`, `request_plan`.
- **Writes (dry-run by default; gated):** `notes_publicize`, `notes_hide`, `recent_reading_publicize`, `quotes_add`, `quotes_remove`, `quotes_reorder`, **`shelf_add`**, **`shelf_remove`**, `set_status`, `rating_update`, `review_upsert`, `request_execute`.

`core` profile includes `shelf_add` / `shelf_remove` so agents can fulfill “add this to want to read” without the full tool surface.

`search_books` and `recommendations_list` are also in `core`. Search returns ranked Goodreads candidates rather than choosing an edition; ask the user to select when candidates are ambiguous. Discovery readers emit identity/rating metadata only—never descriptions, reviews, recommendation explanations, image URLs, or author biography prose. Goodreads can return a 202/robot wall; treat the returned low-confidence warning as a failed lookup, not an empty result.

## 3. Add to Want to Read (shelf add/remove)

Want-to-read shelf slug = **`to-read`**.

```bash
source ~/.goodreads/auth.sh

# Dry-run
goodreads-cli shelves add --book-id <id> --name to-read

# Live
goodreads-cli shelves add --book-id <id> --name to-read --execute

# Remove
goodreads-cli shelves remove --book-id <id> --name to-read --execute
```

MCP:

```json
{
  "name": "goodreads_shelf_add",
  "arguments": { "bookId": "58169", "shelf": "to-read", "execute": true }
}
```

Route: `POST /shelf/add_to_shelf` with `book_id`, `name`, optional `a=remove`.

**Photo / natural language flow:** identify title+author → resolve numeric Goodreads book id → `shelf_add` with `shelf: "to-read"`. If `/book/show/{id}` is bot-walled (202), use editions pages (`/work/editions/{work_id}`) or RSS verification. Wrong id → 404 body `Sorry, we couldn't find that book.` (not auth).

Verify:

```bash
curl -s -b "$GOODREADS_COOKIE" \
  "https://www.goodreads.com/review/list_rss/179929687?shelf=to-read" \
  | grep book_id
```

Live-verified 2026-07-27: Catching the Big Fish (`58169`), Fantastic Mr. Fox (`6693`), Edison's Alley (`20875669`).

## 4. Notes Publicize/Hide

### CRITICAL: PUT /notes/{book_id}/share requires visible=true form body

The endpoint returns 200 with or without body, but defaults to HIDING without `visible=true`. Verified via live CDP network capture of "Make all N visible" button (2026-06-08).

**Publicize (make all visible):**

```bash
source ~/.goodreads/auth.sh
goodreads-cli notes publicize --book-id <id> --approved-book-id <id> --execute --json
```

**Hide all:**

```bash
goodreads-cli notes hide --book-id <id> --approved-book-id <id> --execute --json
```

**VERIFY after every operation:**

```bash
source ~/.goodreads/auth.sh
curl -s -H "Cookie: $GOODREADS_COOKIE" \
  "https://www.goodreads.com/notes/<book_slug>/179929687-zayd-khan" \
  | grep -o "data-visible-count='[0-9]*'"
```

## 5. Commands Quick Reference

```bash
# Route discovery
goodreads-cli api-map routes --json
goodreads-cli api-map search "publicize notes" --json

# Shelf inventory (needs fixtures)
goodreads-cli recent-reading list --fixture-dir <dir> --shelves read,currently-reading --json

# Discovery reads (all read-only; select a search candidate explicitly)
goodreads-cli search books --query "The BFG Roald Dahl" --limit 10 --json
goodreads-cli recommendations list --limit 20 --json
goodreads-cli author show --author-slug 4273.Roald_Dahl --limit 20 --json

# Want-to-read / exclusive shelves
goodreads-cli shelves add --book-id <id> --name to-read --execute
goodreads-cli shelves remove --book-id <id> --name to-read --execute
goodreads-cli shelves discover --user 179929687 --json

# Notes workflow
goodreads-cli notes books --user-id 179929687 --limit 100 --json
goodreads-cli stats year-in-books --user-id 179929687 --year 2025 --json
goodreads-cli recent-reading publicize-plan --fixture-dir <dir> --json
goodreads-cli notes publicize-plan --book-id <id> --details --json
goodreads-cli notes publicize --book-id <id> --approved-book-id <id> --execute --json
goodreads-cli notes hide --book-id <id> --approved-book-id <id> --execute --json

# Raw request
goodreads-cli request execute --route "PUT /notes/{book_id}/share" \
  --param "book_id=<id>" --form "visible=true" --dry-run
```

## 6. Fixture Capture

Goodreads loads shelf/notes data dynamically via XHR. Static HTML dumps are empty.

**Working CDP approach:**

1. Navigate to shelf: `https://www.goodreads.com/review/list/<user_id>?shelf=<slug>&per_page=100`
2. Poll: `document.querySelectorAll('tr[id^="review_"], tr.bookalike').length`
3. Once count > 0, save `document.body.innerHTML`
4. Wrap: `<!DOCTYPE html><html><head>...</head><body>...</body></html>`

**Key selectors:** `tr[id^="review_"]`, `a[href*="/book/show/"]`, `.field.author a`

**User ID:** `179929687` (Zayd). User slug: `179929687-zayd-khan`.

## 7. Known Gaps

| Area                              | Status                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Shelf add/remove (to-read etc.)   | ✅ Live-verified 2026-07-27 (`POST /shelf/add_to_shelf`)                                                                                   |
| Per-note delete                   | ⚠️ Mapped generic route only; no first-class tool or retained live delete/readback receipt                                                 |
| Per-note visibility toggle        | ⚠️ Inferred, not CDP-captured                                                                                                              |
| Per-note spoiler                  | ⚠️ Inferred, not CDP-captured                                                                                                              |
| Per-note like                     | ❌ Not mapped                                                                                                                              |
| Per-note comment                  | ❌ Not mapped                                                                                                                              |
| Quotes write (add/remove/reorder) | ✅ Mapped & live-verified 2026-06-08                                                                                                       |
| Title/author → book_id resolver   | ❌ Agent-side / web search; public `/search` often 202 bot wall                                                                            |
| Pagination (shelf pages 2+)       | ⚠️ Live HTML list currently requests one 100-row page; export can combine caller-provided fixture pages but was not live-walked end to end |

## 8. Shelf Gate

The "Make all N visible" button opens a shelving modal when the browser session is NOT properly authenticated. If the page shows "Read" but the modal says "first add this book to a shelf", the debug Chrome's cookies are stale. Re-copy fresh cookies **once** — that same cookie unlocks notes + shelves.

## 9. Cross-Machine (mothership)

```bash
# Dispatch Claude headless on mothership
ssh mothership "claude --dangerously-skip-permissions -p '...'"

# Mothership known issues: VRM overheat under sustained load (Z370-P + i7-9700K + RTX 2080 Ti)
# Python: python (not python3), v3.10.7 at C:\Python310\
# Node: v24+, pnpm via npx / corepack
```

## 10. Safety

- Never print raw highlights, cookies, CSRF tokens, or private URLs
- Every write defaults to dry-run unless `--execute` + approval gates passed
- Generic mapped mutations additionally require exact `--approved-route` and `GOODREADS_ALLOW_GENERIC_WRITES=1`
- Notes publicize requires all three: `--execute`, `--approved-book-id`, `GOODREADS_ALLOW_NOTES_PUBLICIZE=1`
- Shelf add/remove: dry-run unless `--execute` (same cookie session; CSRF auto-refresh)
- Delete is IRREVERSIBLE (but notes may be recoverable via re-publicize)
- Verify after every live operation — never trust HTTP 200 alone (`requestAccepted` ≠ `mutationVerified`)

## 11. Self-Extension Protocol

If you discover an endpoint not in `api-map/`:

1. Add to `api-map/openapi/` and `api-map/markdown/`
2. Write parser, fixture, test, or live-safe proof
3. Open PR to `zaydiscold/goodreads-cli-mcp-api` main
4. Tag `@ColdCooks`
