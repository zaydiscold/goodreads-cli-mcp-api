# Authenticated Goodreads API-map expansion — 2026-07-14

## Scope and privacy boundary

This pass inspected the user's already-authenticated Goodreads session through the shared debug
Chrome browser. Computer use was used only to identify and foreground the correct Goodreads
window; Chrome DevTools Protocol (CDP) supplied structured DOM, network, and loaded-source
evidence. No write control was clicked or submitted.

The repository stores route templates, methods, parameter names, response statuses, and operation
names only. It does **not** store cookies, CSRF values, AppSync JWTs, request values, response
bodies, private URLs, account identifiers, book identifiers, annotation identifiers, names,
locations, titles, highlights, notes, or screenshots.

## What changed

The REST-style OpenAPI map now contains 107 paths and 114 HTTP operations. A separate AppSync
catalog contains 12 GraphQL operations; 10 user-relevant entries participate in the existing CLI
and MCP route search. AppSync execution remains disabled because it uses a distinct runtime JWT
and operation documents, not the Rails cookie/CSRF executor.

No dedicated MCP tools were added. The existing `api-map search` CLI command and
`goodreads_route_search` MCP tool read the shared catalogs, preserving the eight-tool core profile.

## Current-source correction: Kindle notes

The prior map inferred `/visibility` and `/spoiler` suffix routes. Inspection of the currently
loaded Goodreads application JavaScript showed those guesses were wrong.

| Method | Route template | Form/query keys | Meaning | State |
| --- | --- | --- | --- | --- |
| `PUT` | `/notes/{book_id}/share` | `visible` | Bulk show/hide annotations | Previously live verified |
| `PUT` | `/notes/{book_id}/{annotation_pair_id}` | exactly one of `visible`, `is_spoiler` | Per-annotation privacy/spoiler update | Source verified, not submitted |
| `DELETE` | `/notes/{book_id}/{annotation_pair_id}` | query `reading_note_id`; optional body `book_id` | Delete the entire annotation | Source verified, not submitted |
| `POST` | `/notes/{book_id}/{annotation_pair_id}/note` | `text`, `annotation_pair_id` | Add personal note text | Source verified, not submitted |
| `PUT` | `/notes/{book_id}/{annotation_pair_id}/note` | `text` | Update personal note text | Source verified, not submitted |
| `DELETE` | `/notes/{book_id}/{annotation_pair_id}/note` | none observed | Delete note text but preserve annotation | Source verified, not submitted |

The older Rails-compatible `POST` plus `_method=delete` operation remains mapped because it was
independently verified in June 2026. The two incorrect suffix routes were removed from both
OpenAPI and generated endpoint Markdown.

## Newly mapped authenticated web operations

All writes below are disabled or dry-run by default and were **not submitted** during this pass.

| Area | Method and route | Observed keys or behavior | Evidence |
| --- | --- | --- | --- |
| Account | `GET /user/edit` | optional `tab`, `widget[shelf]` | Authenticated DOM, HTTP 200 |
| Account | `POST /user/update` | `tab`; nested `user[...]` and `user_preference[...]`; four form families | Authenticated DOM |
| Account | `POST /user/edit_fav_genres` | dynamic `favorites[<genre>]` fields | Authenticated DOM |
| Account | `POST /user/sign_out` | session-terminating action | Authenticated DOM |
| Account | `POST /amazon/login/destroy` | Rails method override + CSRF | Authenticated DOM |
| Account | `POST /ap/signin` | interactive Amazon sign-in/link flow | Authenticated DOM |
| Account | `POST /book_link/edit_list` | `country`, `sort` | Authenticated DOM |
| Shelves | `POST /review/list/{user}` | inline review text, private notes, read/start dates, reading session | Authenticated DOM |
| Shelves | `POST /review/destroy/{review_id}` | destructive review removal | Authenticated DOM |
| Shelves | `POST /review/import` | exactly one of uploaded `import[file]` or `import[url]` | Authenticated DOM |
| Shelves | `POST /review/destroy_all` | account-wide destructive action | Authenticated DOM |
| Shelves | `HEAD /review_porter/export/{user_id}/goodreads_export.csv` | current account returned 404 when no prepared export existed | Authenticated network |
| Discovery | `GET /amazon_purchases/books` | `last_row`, `next_page_token`, `origin` | Authenticated network, HTTP 200 |
| Discovery | `POST /user_not_interested_works` | `user_not_interested_work[book_id]` | Authenticated DOM |
| Discovery | `GET /quotes/search` | `q` | Authenticated DOM |
| Social | `GET /friend/find_friend` | `q`, optional `n` | Authenticated DOM |
| Social | `POST /comment` | `comment[body_usertext]`, target `id`, target `type` | Authenticated DOM |
| Notes | `POST /kindle_book_mapping_flags` | `book_id`, `reason`, optional `other_reason` | Authenticated DOM |
| UI | `GET /sign_in_prompt` | `countOverride`; returned HTTP 204 in the authenticated state | Authenticated network |
| Analytics | `GET /dfp/impression` | ad-impression request | Authenticated network, CLI omitted |

Existing routes were also reconfirmed, including `/notifications/track`, `/message/move_batch`,
`/tooltips`, shelf pages, notes pagination, quotes, and recommendations.

## AppSync GraphQL catalog

The live book page emitted these current operations with HTTP 200:

| Operation | Type | Variable keys | Execution |
| --- | --- | --- | --- |
| `myReviewCard` | query | `id` | Catalog only |
| `getReviews` | query | `filters`, `pagination` | Catalog only |
| `getSimilarBooks` | query | `id`, `limit` | Catalog only |
| `GetAdsTargeting` | query | `legacyId`, `legacyResourceType` | Omitted from agent search |

The catalog retains earlier authenticated CDP evidence for `getUser`, `getGiveaways`,
`getFeaturedBookLists`, `getPopularBookLists`, `getBookListsVotedOnByFriends`,
`getSiteHeaderBanner`, `RateBook`, and `UnrateBook`. Historical entries are labeled as such.
`RateBook` and `UnrateBook` are searchable but non-executable until a fresh, explicitly approved
mutation capture confirms the current GraphQL document and runtime JWT flow.

## Deliberate omissions from agent search

The browser emitted `/logging`, `/metrics_logging`, `/metrics_logging_batched`, `/report_metric`,
and `/weblab`. These are telemetry rather than reading/account capabilities. Keeping them out of
the searchable route set reduces agent noise and token cost. `/dfp/impression` and
`/sign_in_prompt` remain documented for completeness but carry `cli_support: omit`.

## How the evidence was gathered

1. Start or reuse the dedicated debug browser with `chrome-debug` on `127.0.0.1:9222`.
2. Connect once with `browser-harness-js` and select the authenticated Goodreads page target.
3. Enable CDP `Page` and `Network` domains.
4. Collect only method, sanitized path template, query-key names, body-key names, resource type,
   status, MIME type, redirect flag, AppSync operation name, and GraphQL variable-key names.
5. Inspect forms as action pathname + method + input-name set. Never read input values.
6. Fetch the already-loaded Goodreads application-script response through CDP and inspect only
   the small code regions surrounding notes persistence methods.
7. Use computer use to foreground the same Goodreads window and visually verify the intended
   authenticated surface; save no screenshot to the repository.
8. Parse both YAML catalogs, regenerate endpoint Markdown, run CLI/MCP search regression tests,
   and verify the old inferred routes are absent.

## Reproduction checks

These checks do not print auth values or private Goodreads content:

```bash
corepack pnpm --filter @zaydiscold/goodreads-cli api-map:endpoints
corepack pnpm test:cli
corepack pnpm test:mcp
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm format:check
```

Expected catalog assertions:

- REST/OpenAPI parses as 107 paths and 114 operations.
- `/notes/{book_id}/{annotation_pair_id}/visibility` is absent.
- `/notes/{book_id}/{annotation_pair_id}/spoiler` is absent.
- Base annotation and note-text routes each expose `PUT` and `DELETE` as documented above.
- CLI and MCP search return `/amazon_purchases/books`.
- CLI and MCP search return `/graphql#RateBook` with `executable: false`.
