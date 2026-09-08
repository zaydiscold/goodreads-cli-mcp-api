# GET /notes/{user_id}/load_more

Mutation: no
Risk: read

Summary: Annotated-book metadata loader. Returns `annotated_books_collection` plus an opaque `next_token`; numeric `page=` does not advance this contract.

Tags: notes

Parameters:
- `user_id` (path, required)
- `start_token` (query, optional): opaque prior next_token. Objects and arrays use jQuery bracket encoding.

Dedicated CLI/MCP output preserves ASIN, title, author, shared counts, scalar highlight/note counts when available, and a query-free Goodreads notes path. It excludes annotation text, image URLs, raw token values, and unknown nested fields. Empty count objects are reported as unavailable, never coerced to zero.

Live-verified 2026-08-02: HTTP 200 JSON, 33 annotated books for the tested account, empty next token. Evidence: `proofs/notes-books-live-2026-08-02.json`.

Source: `api-map/openapi/undocumented/goodreads-web.yaml`

2026-09-07: the CLI and MCP traverse bounded pages and report completeness separately from output truncation. Live read returned a nonempty inventory and an empty cursor. See `docs/browser-coverage-2026-09-07.md`.
