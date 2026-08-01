# Changelog

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
  `https://www.goodreads.com/` with `GOODREADS_COOKIE` and mint a fresh
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
