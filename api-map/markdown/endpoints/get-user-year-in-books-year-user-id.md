# GET /user/year_in_books/{year}/{user_id}

Mutation: no
Risk: read

Summary: Public Year in Books totals, averages, and book extrema. The dedicated CLI/MCP parser emits numeric statistics and book identity metadata only; it intentionally excludes review text.

Tags: users, books, stats

Parameters:

- `year` (path, required) — integer from 2000 through 2100
- `user_id` (path, required) — Goodreads numeric user id

Observed 2026-08-02 through Brave CDP and an independent Node fetch. Sanitized selector evidence: `proofs/year-in-books-live-2026-08-02.json`.

Source: `api-map/openapi/undocumented/goodreads-web.yaml`
