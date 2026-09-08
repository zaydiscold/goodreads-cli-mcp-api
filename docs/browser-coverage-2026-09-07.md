# Authenticated browser coverage, 2026-09-07

## What was found and fixed

The notes loader returns `annotated_books_collection` and an opaque `next_token`. The website's reading-notes bundle passes this back as `start_token` using jQuery query encoding. The CLI previously read only one page. It now follows bounded cursors, deduplicates books, supports late-page ASIN matches, and preserves partial data when pagination fails. CLI and MCP expose maxPages. Incomplete inventories have totalAvailable=null rather than a false total.

Value-minimized live CLI receipt after the change: exit=0, complete=true, pageCount=1, a nonempty inventory returned, truncated=false, confidence=high, warnings=0. This account had no second page; multi-page, structured-cursor, repetition, and partial-failure behavior were exercised with synthetic protocol responses.

Six additional browser-observed operations for reading challenges and user widgets were added to the OpenAPI map. The review edit form also exposed reading-session date fields, private notes, spoiler/sell flags, and feed/blog controls. Their names are recorded without values in `api-map/browser-coverage-2026-09-07.json`. Existing review code preserves captured controls; no review was submitted during this pass.

## How to reproduce

1. Attach `browser-harness-js` to the existing authenticated Chrome CDP profile on localhost port 9222. Use a separate audit tab.
2. Navigate the pages below. Capture Document and Fetch/XHR method, normalized path, query names, and response schemas only. Do not persist cookies, headers, response values, or private text.
3. On the notes page, inspect the site's `reading_notes-6e01aa60a2.js` bundle. Its loader uses `/notes/<user>/load_more` and assigns `o.start_token = nextToken` before `$j.get`.
4. Run `notes books --user-id <your-id> --max-pages 20 --json` with your existing local auth. Compare returned counts with the notes library.
5. Run `corepack pnpm check`. Synthetic tests assert the exact scalar/object/array parameter names and incomplete-result semantics.

## Observed page families

- notes-library: `/notes/{id}`
- account-settings: `/user/edit`
- reading-challenges: `/readingchallenges`
- recommendations: `/recommendations`
- saved-quotes: `/quotes/list`
- own-library: `/review/list/{id}`
- profile-comments: `/comment/list/{id}`
- own-groups: `/group/list/{id}`
- recommendations-to-me: `/recommendations/to_me`
- existing-review-edit-form: `/review/edit/{id}`
- existing-review-comments: `/review/show/{id}`
- reading-statistics: `/review/stats/{id}`
- review-drafts: `/review/drafts`
- library-duplicates: `/review/duplicates`
- import-export: `/review/import`
- shelf-settings: `/shelf/edit`

The metadata inventory contains 26 observed routes and five review-page forms. Unknown response status is recorded as null, not invented as HTTP 200. Browser-observed POST loaders are classified as captured; this is not proof of a persisted account mutation.

## Remaining functional gaps

Comment creation has exact target/text approval and captured-form checks, but reports submitted_unverified until an independent comment-record read confirms persistence. Comment edit/delete and automatic readback are not implemented. Review append checks normalized text and hashes; it cannot provide server-side atomic concurrency. Per-annotation thought writes remain plan-only; note visibility writes need independent readback. Export, recommendation, challenge, and widget route observations do not imply complete typed command support for every server field.

No comments, reviews, shelves, settings, notes, or other account content were changed. This was 16 page visits, not a claim of exhaustive website or mutation coverage. Historical public Git privacy remains a separate release boundary.

## Final validation

The full check passed: 125 CLI tests, 14 MCP tests, two runtime tests, lint, format, type/build checks, dependency audit, and production secret scan. A packed installation exposed the notes max-pages option through the real executable and initialized the optional MCP adapter with 28 tools. No account content was submitted.
