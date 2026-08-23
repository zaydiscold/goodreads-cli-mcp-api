# Capability Evidence and Confidence Ledger

Evidence date: 2026-08-08. This is the current operational truth. Historical route captures describe provenance at their capture date; they do not upgrade a capability's confidence.

Sanitized execution receipt: [`../proofs/live-evidence-walk-2026-08-08.json`](../proofs/live-evidence-walk-2026-08-08.json). It intentionally contains no credentials, account identifiers, book/note content, or raw responses.

## Evidence tiers

| Tier                | Meaning                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| `mapped`            | Route/schema or fixture exists; no meaningful runtime proof.                   |
| `unit`              | Core behavior and failure paths are exercised by the configured test runner.   |
| `live-read`         | A real Goodreads response was parsed into semantic domain data.                |
| `accepted-write`    | Goodreads accepted a real mutation request; account state is not yet proven.   |
| `verified-write`    | A separate authenticated read proved the intended account state.               |
| `rollback-verified` | A second mutation restored prior state and a separate read proved restoration. |

No command is called “working” beyond its highest tier. HTTP success, nonempty HTML, fixture parsing, a request plan, and `submitted: true` are not mutation proof.

## Live-walked capability families

| Capability               | CLI / MCP surface                                         | Highest evidence    | 2026-08-08 receipt                                                                                           |
| ------------------------ | --------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| Public search            | `search books` / `goodreads_search_books`                 | `live-read`         | Parsed nonempty book candidates with public-cookie routing.                                                  |
| Public book detail       | `book show` / `goodreads_book_show`                       | `live-read`         | Parsed normalized public book metadata.                                                                      |
| Public similar books     | `book similar` / `goodreads_similar_books`                | `live-read`         | Parsed nonempty Readers-also-enjoyed metadata from server-rendered React props; prose/images omitted.        |
| Public author detail     | `author show` / `goodreads_author_show`                   | `live-read`         | Parsed public author and bibliography metadata.                                                              |
| Year in Books            | `stats year-in-books` / `goodreads_year_in_books`         | `live-read`         | Parsed semantic annual totals/extrema for the authenticated user's public year page.                         |
| Shelf discovery          | `shelves discover` / `goodreads_shelves_discover`         | `live-read`         | Parsed signed-in shelf inventory.                                                                            |
| Shelf books              | `books list` / `goodreads_books_list`                     | `live-read`         | Parsed 100 authenticated rows, five discovered shelves, and pagination metadata; signed-out state was false. |
| Recommendations          | `recommendations list` / `goodreads_recommendations_list` | `live-read`         | Parsed nonempty personalized cards.                                                                          |
| Annotated-book index     | `notes books` / `goodreads_notes_books`                   | `live-read`         | Parsed nonempty redacted book-note metadata.                                                                 |
| Library state            | `library show` / `goodreads_library_show`                 | `live-read`         | Parsed authenticated status/rating/review state.                                                             |
| Mapped message folders   | `messages folders` / `goodreads_messages_folders`         | `unit`              | Returns the static mapped folder catalog; this is not a live inbox read.                                     |
| Generic request planning | `request plan` / `goodreads_request_plan`                 | `unit`              | Canonical book route produced a non-mutating plan. A plan does not prove request execution.                  |
| Shelf/status mutation    | `shelves add/remove`, `library set-status`                | `rollback-verified` | `to-read → currently-reading → to-read`, each state read from authenticated `/review/edit/{book_id}`.        |
| Rating mutation          | `library rating` / `goodreads_rating_update`              | `rollback-verified` | `0 → 1 → 0`, authenticated readback.                                                                         |
| Review mutation          | `library review` / `goodreads_review_upsert`              | `rollback-verified` | absent → temporary marker → absent, authenticated readback.                                                  |
| Quote create/remove      | `quotes add/remove`                                       | `rollback-verified` | Created quote, captured canonical slug, removed it, and proved absence on the canonical user quote list.     |
| Quote reorder            | `quotes reorder`                                          | `rollback-verified` | Moved one quote down, proved ordering, moved it up, and proved original ordering.                            |
| Notes visibility         | `notes publicize/hide`                                    | `rollback-verified` | 29 visible → 29 hidden → 29 visible, parsed per-note visibility after each transition.                       |

## Implemented but not live-proven end to end

| Capability                                                                                                                                     | Current truth                                                                                                                               | Do not claim                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Books export                                                                                                                                   | Authenticated/fixture pagination logic and unit coverage exist. No fresh end-to-end export file was generated and reconciled in this audit. | “Live export verified.”                      |
| Comments                                                                                                                                       | Live URL planning and fixture parsing exist.                                                                                                | “Live comments read.”                        |
| Message listing                                                                                                                                | Fixture parser with redacted metadata exists.                                                                                               | “Live inbox/messages read.”                  |
| Annotation listing                                                                                                                             | Fixture/detail parser exists; the publicized-note workflow indirectly parsed visibility but did not certify every annotation command mode.  | “Every annotation operation is live-tested.” |
| Annotation thought writes                                                                                                                      | Plan-only. No per-note thought creation/update/delete was fired.                                                                            | “Thought writes work.”                       |
| Recent-reading joins                                                                                                                           | Fixture-backed join logic and tests exist.                                                                                                  | “Live current-reading join verified.”        |
| Bookshelf move plan                                                                                                                            | Plan-only.                                                                                                                                  | “Batch shelf move executed.”                 |
| Raw request execution                                                                                                                          | Engine/gate and selected routes are tested; arbitrary map entries are not individually live-walked.                                         | “Every mapped route executes.”               |
| AppSync rating metadata                                                                                                                        | Catalog/search metadata only; Rails rating is the verified product path.                                                                    | “AppSync rating mutation works.”             |
| Custom shelf creation, shelf settings, batch shelf moves, import, friends/social mutations, messages, comments, annotation deletion/note edits | Mapped or fixture/static evidence only unless separately identified above.                                                                  | Any live guarantee.                          |

## Complete shared-registry inventory

All 39 `cli/src/engine.ts` capability keys are classified here. `dynamic-inventory-guidance` is intentionally MCP-only; the others share CLI/MCP engine behavior where registered.

| Registry key                    | Highest tier                                                               |
| ------------------------------- | -------------------------------------------------------------------------- |
| `api-map-routes`                | `unit` / local catalog                                                     |
| `api-map-search`                | `unit` / local catalog                                                     |
| `browser-routes`                | `mapped` / local catalog                                                   |
| `shelves-discover`              | `live-read`                                                                |
| `books-list`                    | `live-read`                                                                |
| `books-export`                  | `unit`                                                                     |
| `book-show`                     | `live-read`                                                                |
| `search-books`                  | `live-read`                                                                |
| `recommendations-list`          | `live-read`                                                                |
| `author-show`                   | `live-read`                                                                |
| `year-in-books`                 | `live-read`                                                                |
| `comments-list`                 | `unit` / fixture parser                                                    |
| `messages-folders`              | `unit` / static catalog                                                    |
| `messages-list`                 | `unit` / fixture parser                                                    |
| `annotations-list`              | `unit` / fixture parser                                                    |
| `annotations-thoughts-plan`     | `unit` / plan-only                                                         |
| `notes-inspect`                 | `unit` / fixture parser                                                    |
| `notes-books`                   | `live-read`                                                                |
| `notes-publicize-plan`          | `live-read` + plan-only                                                    |
| `notes-publicize`               | `rollback-verified`                                                        |
| `notes-hide`                    | `rollback-verified`                                                        |
| `quotes-add`                    | `rollback-verified`                                                        |
| `quotes-remove`                 | `rollback-verified`                                                        |
| `quotes-reorder`                | `rollback-verified`                                                        |
| `shelf-add`                     | `rollback-verified`                                                        |
| `shelf-remove`                  | `rollback-verified`                                                        |
| `recent-reading-list`           | `unit` / fixture parser                                                    |
| `recent-reading-notes`          | `unit` / fixture join                                                      |
| `recent-reading-publicize-plan` | `unit` / plan-only                                                         |
| `recent-reading-publicize`      | `unit`; no direct live walk                                                |
| `bookshelf-move-plan`           | `unit` / plan-only                                                         |
| `write-plan-notes-publicize`    | `unit` / plan-only                                                         |
| `request-plan`                  | `unit` / plan-only                                                         |
| `request-execute`               | `unit` generically; selected underlying routes only have stronger evidence |
| `library-show`                  | `live-read`                                                                |
| `set-status`                    | `rollback-verified`                                                        |
| `rating-update`                 | `rollback-verified`                                                        |
| `review-upsert`                 | `rollback-verified`                                                        |
| `dynamic-inventory-guidance`    | `unit` / local guidance                                                    |

## Release rule

1. Add every new public command/tool to this ledger.
2. Record the strongest evidence actually produced.
3. Mutations graduate only after independent account-state readback.
4. Reversible mutations graduate to `rollback-verified` only after restoration readback.
5. Never upgrade a whole route family from one successful representative route.
6. Keep credentials, IDs, titles, note text, message bodies, and account-specific values out of receipts.
