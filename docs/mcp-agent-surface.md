# MCP Agent Surface

The MCP package exposes both read and gated write surfaces. Standard MCP
annotations advertise read-only, idempotent, destructive, and open-world hints;
the generic executor is conservatively destructive.

## Tools

Use `GOODREADS_MCP_PROFILE=full|core|notes` to select the advertised subset.
`full` preserves all legacy names; `core` and `notes` reduce routine discovery
by about 71% and 51%. See [token-efficiency.md](./token-efficiency.md).

- `goodreads_api_map_routes` lists the bundled web/RSS route map.
- `goodreads_route_search` searches mapped capabilities such as notes publicizing, shelf exports, message folders, friends, and profile pages.
- `goodreads_browser_routes` lists sanitized authenticated Chrome CDP route templates from the 2026-05-26 recapture.
- `goodreads_bookshelf_move_plan` returns a dry-run form plan for moving an existing review row to another shelf.
- `goodreads_notes_publicize_plan` returns a dry-run plan for the notes/highlights publicize route.
- `goodreads_recent_reading_list` lists current/recent shelf books from caller-supplied local fixtures.
- `goodreads_recent_reading_notes` joins recent shelf books to notes/highlights metadata without raw highlight text.
- `goodreads_recent_reading_publicize_plan` plans recent-reading notes publicization and never submits writes.
- `goodreads_request_execute` runs reads live and plans mutations unless all generic write gates are present.
- `goodreads_dynamic_inventory_guidance` explains which account-specific collections must be discovered before acting.

## Dynamic Inventory Rule

Goodreads surfaces are not global constants. A user's shelves, message folders, note modules, friend links, comments, review IDs, and pagination change by account and over time. The CLI should discover the current page/account inventory before resolving aliases like `to-read` or planning a form action.

Seeded Zayd routes are valid examples, not universal truth. Treat per-user/per-book/per-message links as discovered inventory and keep adding them to `api-map/` with evidence.

## Write Boundary

The generic executor requires `execute=true`, an exact `approvedRoute`, and
`GOODREADS_ALLOW_GENERIC_WRITES=1` for mutations. The notes/highlights workflow
uses `GOODREADS_ALLOW_NOTES_PUBLICIZE=1`, exact approved book ids, and explicit
execute flags. HTTP acceptance never implies the account mutation was verified.

Known notes/highlights publicize shape:

```text
PUT /notes/{book_id}/share
GET /notes/{book_slug}/{user_slug}
```

After any approved live run, reload `/notes/{book_slug}/{user_slug}` and verify the visible state before claiming success. The write route takes numeric `book_id`; the verification route takes the detail-page `book_slug`.
