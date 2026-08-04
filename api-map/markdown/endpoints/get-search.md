# GET /search

Mutation: no
Risk: read

Summary: Canonical title/author book-candidate resolver. Dedicated product surface: `goodreads-cli search books --query "<title> <author>"`; MCP `goodreads_search_books` (full and core profiles).

Tags: discovery

Parameters:
- q (query, required)
- search_type (query; product client sends `books`)

Fresh HTTP evidence (2026-08-04): authenticated-cookie request returned 200 search HTML with 20 parseable `.bookTitle` cards. The parser emits only candidate id/title/author/rating-summary metadata; it intentionally excludes descriptions and reviews. Goodreads may return a 202/robot challenge from non-browser traffic; the engine reports that as low-confidence `warnings`, not a successful empty result.

Source: api-map/openapi/undocumented/goodreads-web.yaml
