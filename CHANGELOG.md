# Changelog

## Unreleased — 2026-08-28 (exact annotation counts + publication regression)

- Added live detail hydration to `notes books` / `goodreads_notes_books`, including exact highlight, attached-note, visible, hidden, and total annotation counts without raw text.
- Added repeatable ASIN filters so detail hydration targets active books before network requests are sent.
- Added bounded-worker, parser, privacy, engine, CLI, and MCP regression coverage.
- Documented the Goodreads cron publication-order regression that left 15 highlights unpublished across HWFWM1/2; restoring the proven idempotent publish-all-first contract verified all 34 books at 407 shared of 407 total annotations.
- Raised the arbitrary production function-line ceiling from 80 to 140 while retaining complexity, typecheck, lint, format, integrity, and behavior gates.


## Unreleased — 2026-08-23 (HTTP origin hardening)

- Restricted every shared Goodreads HTTP helper to the exact HTTPS origin `https://www.goodreads.com` before any network request is sent.
- Replaced automatic redirect following with bounded, same-origin redirect handling so authenticated and public-safe cookie jars cannot cross an origin boundary.
- Added focused regression coverage for direct custom-origin requests, deceptive hostnames, cleartext URLs, embedded credentials, and cross-origin redirects.

## Unreleased — 2026-08-23 (daily watch)

- `comments list --user-slug` and `goodreads_comments_list` now read the authenticated recent-post page live instead of returning a plan-only null parse.
- Live output remains redaction-first: comment counts and link/form shape only, never comment bodies.
- Added focused engine coverage and updated the evidence ledger for the unified daily reading/annotations/comments watchdog.

## Unreleased — 2026-08-23

### Daily reading sync hardening

- Fixed authenticated shelf parsing when Goodreads renders a cover-image link before the textual `a.bookTitle`; live HTML now returns all seven current titles instead of `null`.
- Moved the WSL cron helper from the repository root to `scripts/goodreads-daily-sync.sh`, removed machine-specific defaults, made writes atomic, and kept explicit success/failure receipts.
- Simplified the README's stale v1 token table into current MCP profile guidance and added compact navigation.

## Unreleased — 2026-08-22

### Similar books read surface

- Added `book similar <work-slug>` and `goodreads_similar_books` over one shared engine.
- Parses Goodreads' public `ReactComponents.SimilarBooksList` hydration props into bounded book/work identity and rating metadata.
- Excludes the source work, duplicates, descriptions, reviews, and image URLs; ships in `full` and `core` MCP profiles.
- Live-read verified against `GET /book/similar/{work_slug}` without account cookies or browser runtime dependencies.

## Unreleased — 2026-08-01

### Bookstore haul + Kindle parity (live)

- Photo → resolve → `shelves add --name to-read --execute` proven on multi-title
  bookstore hauls (session cookie + auto CSRF). Titles land on Want to Read.
- Cross-repo: pair with [amazon-kindle-cli-mcp-api](https://github.com/zaydiscold/amazon-kindle-cli-mcp-api)
  (`wishlist add` / `parity` / `sync goodreads-plan`) for Goodreads ↔ Amazon
  wishlist / Kindle list parity on the same stack.
- Library writes no longer stubs: `set-status` reuses shelf add; rating/review
  via `POST /review/update/{book_id}` (PR #9).

## Unreleased — 2026-07-27

Snap a bookstore stack photo → agent resolves ids → Want to Read. Same cookie
session as notes; CSRF auto-refresh so the next write feature doesn't eat
stale-token 404s.

### Shelf add / remove (live)

- First-class `shelves add` / `shelves remove` CLI commands + MCP tools
  `goodreads_shelf_add` / `goodreads_shelf_remove` (also in `core` profile).
- Drives proven route `POST /shelf/add_to_shelf` with `book_id` + `name`
  (`to-read` / `currently-reading` / `read` / custom) and `a=remove` for remove.
- Live-verified 2026-07-27: Catching the Big Fish (`58169`), Fantastic Mr. Fox
  (`6693`), Edison's Alley (`20875669`) added to to-read and confirmed via RSS.

### Auth hardening (same cookie for every write)

- Mutation client always sends `Referer` + `Origin` + `X-Requested-With` on
  account writes (Goodreads returns opaque 404s without them — same lesson as
  `publicize.py`).
- **Auto CSRF refresh:** before live Rails mutations, GET
  `https://www.goodreads.com/review/list` with `GOODREADS_COOKIE` and mint a fresh
  `csrf-token`. Stale `GOODREADS_CSRF_TOKEN` in auth.sh no longer breaks shelves
  or notes. Skip only with `GOODREADS_SKIP_CSRF_REFRESH=1` (tests).
- Error bodies are surfaced on failed writes (e.g. `Sorry, we couldn't find that book.`).
- Docs: `docs/auth.md`, `docs/write-operations.md`, `docs/gotchas.md`, `SKILL.md`.

## 1.0.0 — 2026-07-14

First stable release of the paired Goodreads API map, CLI, and MCP server.

### Agent efficiency

- Added `full`, `core`, and `notes` MCP profiles over one shared engine.
- Reduced core `tools/list` discovery from 4,011 to 1,164 `o200k_base`
  tokens: **70.98% fewer tokens**.
- Reduced core discovery JSON from 17,034 to 4,830 bytes: **71.64% fewer
  bytes**.
- Reduced routine visible tools from 28 to 8: **71.43% fewer tools**.
- Kept compact MCP output, bounded route results, and summarized browser-route
  output as defaults.

### API, CLI, and MCP

- Expanded the authenticated web map to 107 paths and 114 HTTP operations.
- Added a 12-operation AppSync catalog with non-executable mutation metadata.
- Corrected individual Kindle annotation visibility, spoiler, deletion, and
  note-text methods from current Goodreads client source.
- Kept CLI and MCP behavior paired through the shared engine and parity tests.

### Safety and runtime

- Restricted credentials to the exact Goodreads origin and rejected
  credentialed cross-origin redirects.
- Prevented CSRF form-field injection into custom-origin requests.
- Kept mapped writes dry-run by default with route-specific approval gates.
- Added build-aware macOS/Linux and Windows launchers so generated
  `mcp/dist/server.js` is rebuilt when missing or stale.

### Verification

- 35 CLI tests and 9 real MCP stdio tests pass on macOS, Windows, and GitHub CI.
- Codex, Claude Code, and Hermes use the eight-tool core profile on both paired
  machines.
