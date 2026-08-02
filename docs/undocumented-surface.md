# Undocumented Surface

Mapped undocumented or semi-documented Goodreads surfaces:

- `/review/list/:user?shelf=:shelf` authenticated shelf HTML.
- `/review/list_rss/:user?shelf=:shelf` public shelf RSS fallback.
- `/tooltips` book metadata XHR.
- `/notes/:user_slug`, `/notes/:user_id/load_more`, and `/notes/:book_slug/:user_slug`.
- `/notes/:book_id/share` approved notes-publicize write route for pasted pages.
- `/shelf/add_to_shelf`, `/shelf/remove_book`, `/review/update_list/:user_id` dry-run shelf mutation routes.
- 2026-05-25 sitemap/nav expansion added public hub and object routes for awards, Choice Awards, authors, giveaways, groups, news/interviews, Ask the Author questions, public quotes, similar books, work editions, and current-user `/review/list`. Evidence is in `goodreads/proofs/goodreads-robots-2026-05-25.txt`, `goodreads/proofs/goodreads-genres-anchor-sample-2026-05-25.txt`, and `goodreads/proofs/goodreads-sitemap-*-sample-2026-05-25.xml`.
- `/message/:folder`, `/message/show/:message_id`, `/message/move_batch` message surfaces.
- 2026-05-26 authenticated Chrome CDP recapture added 15 sanitized route templates across home/feed, shelves, profile, messages, notes, friends, recommendations, tooltips, and load-more XHR. Evidence is in `proofs/cdp-goodreads-authenticated-sanitized-2026-05-26.json` and `api-map/browser-cdp-routes-2026-05-26.json`.

- 2026-08-02 added public `/user/year_in_books/{year}/{user_id}` after Brave CDP plus independent HTTP verification. The dedicated parser emits totals, averages, and book identity/extrema only; review text is intentionally excluded. Evidence: `proofs/year-in-books-live-2026-08-02.json`.

Discovery methods are documented in `research/current-api-sweep-2026-05-22.md` and `research/user-pages-map.md`.
