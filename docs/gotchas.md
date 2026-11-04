# Gotchas

- **One cookie for everything.** Notes, shelves, quotes, and generic writes share `GOODREADS_COOKIE`. There is no per-feature login. If notes publicize works with the cookie, shelf add uses the same session.
- **Stale CSRF ≠ dead cookie.** Auth files often carry an old `GOODREADS_CSRF_TOKEN`. The client refreshes CSRF from the cookie before live Rails mutations. Do not treat write 404s as "need a second login" until you have checked Referer headers and book_id.
- **Opaque 404 without browser headers.** Mutations without `Referer` / `Origin` / `X-Requested-With` often return HTTP 404. Fixed in `cli/src/client/live.ts` for all writes.
- **404 body `Sorry, we couldn't find that book.`** Wrong numeric `book_id`. Resolve via editions page (`/work/editions/{work_id}`) when `/book/show/{id}` returns anti-bot 202.
- Goodreads shelf names are account inventory, not a global enum. Exclusive defaults: `to-read`, `currently-reading`, `read`.
- **Public shelf RSS is gone.** Since about 2026-10-28 every `/review/list_rss/...` and `/user/updates_rss/...` URL returns 404, signed in or not, and the shelf page no longer links a feed. The anonymous replacement is `/review/custom_widget/<numeric-id>.x?shelf=...&num_books=100&widget_id=...` (`parsers/widget.ts`): newest 100 books max, title/author/rating/cover-derived book id, no review text.
- **The widget is cached per (user, widget_id).** On a cache hit Goodreads ignores `shelf`, `num_books`, and every other param and replays the old widget. Always send a fresh `widget_id` and check the header link names the user and shelf you asked for. (In zsh, `$RANDOM` repeats inside each `$(...)` subshell, which reuses an id by accident.)
- **The widget path needs the numeric id.** `42.x` works; the slug `42-example-reader` 404s.
- Authenticated shelf HTML uses pagination, often 30 rows per page.
- Book pages are Next.js-backed and include JSON-LD plus `__NEXT_DATA__`.
- `__NEXT_DATA__` can contain public review bodies; do not store raw review text by default.
- Kindle note pages can contain raw highlight text; emit metadata unless the user explicitly asks for owned export.
- Message pages can contain private sender/subject/body data; default to ids and structural metadata.
- Goodreads can show Cloudflare or Amazon SSO friction. Re-authentication is the fix, not blind retries — then re-extract the cookie once.
- `GOODREADS_SKIP_CSRF_REFRESH=1` is for unit tests only. Never set it in production MCP wrappers.
