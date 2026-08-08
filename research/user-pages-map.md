# Goodreads Authenticated User Pages Map

> **Historical capture snapshot.** Route and form evidence remains useful, but
> implementation status has moved on. Current behavior is documented in
> [`../docs/auth.md`](../docs/auth.md) and [`../docs/write-operations.md`](../docs/write-operations.md).

Generated: 2026-05-22T08:25:00Z

## Artifact

Raw local metadata:

```text
goodreads/proofs/user-pages-map-2026-05-22.json
```

Mode:

```text
0600
```

Privacy boundary:

- Captured request metadata, URLs, page titles, DOM link metadata, form action/method/input names.
- Did not capture cookie values, request headers, or response bodies.
- Link text and URLs can still contain account-visible labels, so keep the artifact local/private.

## Pages Captured

| Label                      | Final URL                                                   | Title                     | Links | Forms |
| -------------------------- | ----------------------------------------------------------- | ------------------------- | ----: | ----: |
| friend_requests            | `/friend/requests?ref=nav_my_friends`                       | Friend Requests           |   101 |     3 |
| notifications              | `/notifications?ref=nav_my_notifs`                          | Notifications             |   129 |     2 |
| group_discussions          | `/topic?discussion_filter=groups`                           | Discussions               |   128 |     2 |
| profile                    | `/user/show/179929687-zayd-khan`                            | Zayd Khan profile         |   398 |    51 |
| my_books_all               | `/review/list/179929687`                                    | 182 books                 |   784 |     9 |
| my_books_read              | `/review/list/179929687?shelf=read`                         | 38 read books             |   799 |     9 |
| my_books_currently_reading | `/review/list/179929687?shelf=currently-reading`            | 6 currently-reading books |   308 |     9 |
| my_books_to_read           | `/review/list/179929687?shelf=to-read`                      | 132 to-read books         |   791 |     9 |
| my_quotes                  | `/quotes/list`                                              | 30 quotes                 |   544 |     5 |
| my_comments                | `/comment/list/179929687-zayd-khan?ref=nav_profile_comment` | recent posts/comments     |    94 |     3 |
| kindle_notes               | `/notes/179929687-zayd-khan`                                | Kindle Notes & Highlights |   118 |     2 |
| recommendations            | `/recommendations`                                          | Recommended for You       |   219 |    27 |

## Batch 2 Pages Captured

Raw local metadata:

```text
goodreads/proofs/user-pages-map-batch2-2026-05-22.json
```

Mode:

```text
0600
```

| Label                              | Route                                                               | Title                        | Links | Forms |
| ---------------------------------- | ------------------------------------------------------------------- | ---------------------------- | ----: | ----: |
| message_inbox                      | `/message/inbox?ref=nav_my_messages`                                | my inbox                     |   100 |     3 |
| year_in_books_2025                 | `/user/year_in_books/2025/179929687`                                | Zayd's Year in Books         |   115 |     2 |
| friends_index                      | `/friend`                                                           | Friends                      |   151 |     4 |
| list_show_1                        | `/list/show/1`                                                      | Best Books Ever              |  2473 |   224 |
| review_list_slug_read              | `/review/list/179929687-zayd-khan?shelf=read`                       | read shelf                   |   797 |     9 |
| review_list_numeric_all            | `/review/list/179929687`                                            | all books                    |   784 |     9 |
| review_list_numeric_to_read        | `/review/list/179929687?shelf=to-read`                              | to-read shelf                |   791 |     9 |
| book_show_gate_feral_gods          | `/book/show/57905101-the-gate-of-the-feral-gods`                    | book page                    |   145 |     1 |
| review_list_slug_currently_reading | `/review/list/179929687-zayd-khan?shelf=currently-reading`          | currently-reading shelf      |   308 |     9 |
| notes_list_ref                     | `/notes/179929687-zayd-khan?ref=us_w`                               | My Kindle Notes & Highlights |   118 |     2 |
| notes_detail_inevitable_ruin       | `/notes/220329192-this-inevitable-ruin/179929687-zayd-khan?ref=abp` | notes detail                 |   224 |    14 |
| profile_text_fragment_notes        | `/user/show/179929687-zayd-khan`                                    | profile                      |   421 |    53 |

Route implications:

- Shelf pages accept both numeric and slugged user route forms.
- Shelf selection is controlled with `?shelf=<shelf-slug>`.
- The stable user id in the pasted URLs is `179929687`.
- Book detail pages are Next.js-backed now; legacy Goodreads pages and Next.js pages coexist.
- Public list pages such as `/list/show/1` are large and form-heavy; parser code must cap link/form extraction in debug output.

## Navigation and Bookshelf Link Capture

Valid artifact:

```text
goodreads/proofs/nav-bookshelves-links-2026-05-22-v3.json
goodreads/proofs/genres-page-links-2026-05-22.json
```

Invalid partial artifacts:

```text
goodreads/proofs/nav-bookshelves-links-2026-05-22.json
goodreads/proofs/nav-bookshelves-links-2026-05-22-v2.json
```

Important profile menu links observed:

| Label                     | Route                                                       |
| ------------------------- | ----------------------------------------------------------- |
| Zayd Khan / Profile       | `/user/show/179929687-zayd-khan`                            |
| Friends                   | `/friend?ref=nav_my_friends`                                |
| Groups                    | `/group?ref=nav_comm_groups`                                |
| Discussions               | `/topic?ref=nav_comm_discuss`                               |
| Comments                  | `/comment/list/179929687-zayd-khan?ref=nav_profile_comment` |
| Kindle Notes & Highlights | `/notes?ref=nav_profile_knh`                                |
| Quotes                    | `/quotes?ref=nav_comm_quotes`                               |
| Favorite genres           | `/user/edit_fav_genres?...`                                 |
| Friends' recommendations  | `/recommendations/to_me?ref=nav_profile_friendrec`          |
| Account settings          | `/user/edit?ref=nav_profile_settings`                       |
| Help                      | `/help?action_type=help_nav_bar&ref=nav_profile_help`       |
| Sign out                  | `/user/sign_out?ref=nav_profile_signout`                    |

Important Browse/Community links observed:

| Label             | Route                                      |
| ----------------- | ------------------------------------------ |
| Recommendations   | `/recommendations?ref=nav_brws_recs`       |
| Choice Awards     | `/choiceawards?ref=nav_brws_gca`           |
| Giveaways         | `/giveaway?ref=nav_brws_giveaways`         |
| New Releases      | `/new_releases?ref=nav_brws_newrels`       |
| Lists             | `/list?ref=nav_brws_lists`                 |
| Genres            | `/genres?ref=nav_brws_genres`              |
| News & Interviews | `/news?ref=nav_brws_news`                  |
| Groups            | `/group?ref=nav_comm_groups`               |
| Discussions       | `/topic?ref=nav_comm_discuss`              |
| Quotes            | `/quotes?ref=nav_comm_quotes`              |
| Ask the Author    | `/ask_the_author?ref=nav_comm_askauthor`   |
| People            | `/user/best_reviewers?ref=nav_comm_people` |

Genre index capture:

| Label              | Route                        |
| ------------------ | ---------------------------- |
| Art                | `/genres/art`                |
| Business           | `/genres/business`           |
| Cookbooks          | `/genres/cookbooks`          |
| Crime              | `/genres/crime`              |
| Fantasy            | `/genres/fantasy`            |
| Fiction            | `/genres/fiction`            |
| Historical Fiction | `/genres/historical-fiction` |
| History            | `/genres/history`            |

The `/genres?ref=nav_brws_genres` page produced 184 total links and 74 genre links. The user-visible `All Genres` and `Favorite Genres` labels were not literal anchors on the genre index page; the route-level equivalent for all genres is `/genres`.

Important My Books and tools links observed:

| Label                     | Route                                                       |
| ------------------------- | ----------------------------------------------------------- |
| My Books                  | `/review/list/179929687?ref=nav_mybooks`                    |
| Batch Edit                | `/review/list/179929687#`                                   |
| Settings                  | `/review/list/179929687#`                                   |
| Stats                     | `/review/stats/179929687`                                   |
| Print                     | `/review/list/179929687?print=true`                         |
| All                       | `/review/list/179929687?shelf=%23ALL%23`                    |
| Want to Read              | `/review/list/179929687-zayd-khan?shelf=to-read`            |
| Currently Reading         | `/review/list/179929687-zayd-khan?shelf=currently-reading`  |
| Read                      | `/review/list/179929687-zayd-khan?shelf=read`               |
| Did Not Finish            | `/review/list/179929687-zayd-khan?shelf=did-not-finish`     |
| for-the-aesthetic         | `/review/list/179929687-zayd-khan?shelf=for-the-aesthetic`  |
| want-to-read-again        | `/review/list/179929687-zayd-khan?shelf=want-to-read-again` |
| Review Drafts             | `/review/drafts`                                            |
| Kindle Notes & Highlights | `/notes?ref=nav_profile_knh`                                |
| Reading Challenge         | `/readingchallenges?ref=web_ingress`                        |
| Reading stats             | `/review/stats/179929687-zayd-khan`                         |
| Amazon book purchases     | `/amazon_purchases?source=bn`                               |
| Find duplicates           | `/review/duplicates`                                        |
| Widgets                   | `/user/edit?tab=widgets`                                    |
| Import and export         | `/review/import`                                            |

## Discovery Pages Batch

Raw local metadata:

```text
goodreads/proofs/discovery-pages-map-2026-05-22.json
```

Mode:

```text
0600
```

Captured without submitting forms or clicking write links:

| Label                    | Route                                      | Notes                                                                        |
| ------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------- |
| amazon_purchases         | `/amazon_purchases?source=bb`              | Add Amazon books to Goodreads import surface; includes load-more link state. |
| shelf_index              | `/shelf`                                   | Top public shelves; form submits `GET /shelf/show` with `shelf=<name>`.      |
| genres_list              | `/genres/list`                             | Alphabetical genre shelf index; includes `GET /genres/search` finder.        |
| genre_historical_fiction | `/genres/historical-fiction`               | Concrete user-requested genre page.                                          |
| people_best_reviewers    | `/user/best_reviewers?ref=nav_comm_people` | People discovery landing from Community nav.                                 |
| user_top_readers         | `/user/top_readers`                        | People subpage.                                                              |
| user_top_reviewers       | `/user/top_reviewers`                      | People subpage.                                                              |
| user_best_reviewers      | `/user/best_reviewers`                     | Most popular reviewers.                                                      |
| user_most_followed       | `/user_following/most_followed`            | Most-followed users.                                                         |
| message_inbox            | `/message/inbox?ref=nav_my_messages`       | Folder links, message detail link, batch move/read form.                     |

Message inbox nuance:

- Folder routes are `/message/inbox`, `/message/saved`, `/message/sent`, and `/message/trash`.
- Message detail route observed as `/message/show/:message_id`.
- Batch action form is `POST /message/move_batch?page=1` with `folder`, `move[folder]`, `messages[<id>]`, and `authenticity_token`.
- `GET /message/mark_all_as_read` exists as a link, but it was not clicked.

## Bookshelf Read/Move Capture

Raw local metadata:

```text
goodreads/proofs/bookshelves-read-move-map-2026-05-22.json
goodreads/proofs/bookshelf-edit-popover-map-2026-05-22-v2.json
goodreads/proofs/bookshelf-script-routes-2026-05-22.json
```

Mode:

```text
0600
```

Current live shelf names/counts from the authenticated table capture:

| Shelf              | Count |
| ------------------ | ----: |
| All                |    28 |
| to-read            |   132 |
| currently-reading  |     7 |
| read               |    40 |
| did-not-finish     |     6 |
| for-the-aesthetic  |     2 |
| want-to-read-again |     2 |

These values are Zayd's current account inventory, not a global Goodreads enum. The CLI should discover shelves from the active account before listing, exporting, or moving books. `to-read`, `currently-reading`, and `read` are useful common aliases, but the discovered sidebar/form inventory wins.

Pagination matters on the main bookshelf pages. Fixture parsing proved:

| Shelf   | Declared Count | Pages Seen | Unique Review IDs Parsed |
| ------- | -------------: | ---------: | -----------------------: |
| read    |             40 |          2 |                       40 |
| to-read |            132 |          5 |                      132 |

By contrast, the public RSS fallback returned only 100 items for the 132-book `to-read` shelf. Use authenticated HTML/table pagination for full export.

Batch shelf move/add form:

```text
POST /review/update_list/179929687
authenticity_token=<from-current-page>
view=table
edit[shelf]=<shelf-slug>
reviews[<review_id>]=<review_id>
```

Single-book chooser route from static JS:

```text
POST /shelf/add_to_shelf
book_id=<book_id>
name=<shelf-slug>
a=<empty-or-remove>
```

Other script-mined shelf routes:

```text
POST /shelf/remove_book
POST /shelf/move_batch
POST /shelf/move_batch/:user_id
POST /shelf/move_to_position
POST /review/update/:book_id
POST /review/update_session_shelf_settings
```

No shelf mutation was submitted during this capture. The first CLI implementation should turn these into write plans with exact book/review ids, target shelf, form source page, and verification URL before any `--execute` path exists.

## Same-Site Network Endpoints

Read-oriented:

- `GET /friend/requests?ref=nav_my_friends`
- `GET /notifications?ref=nav_my_notifs`
- `GET /topic?discussion_filter=groups&ref=...`
- `GET /user/show/179929687-zayd-khan`
- `GET /user/delayable_user_show/179929687`
- `GET /review/list/179929687`
- `GET /review/list/179929687?shelf=read`
- `GET /review/list/179929687?shelf=currently-reading`
- `GET /review/list/179929687?shelf=to-read`
- `GET /tooltips?resources[Book.<id>]...`
- `GET /quotes/list`
- `GET /quotes/widget/179929687-zayd-khan`
- `GET /comment/list/179929687-zayd-khan`
- `GET /notes/179929687-zayd-khan`
- `GET /notes/179929687/load_more`
- `GET /recommendations`
- `GET /message/inbox`
- `GET /user/year_in_books/2025/179929687`
- `GET /friend`
- `GET /list/show/1`
- `GET /book/show/57905101-the-gate-of-the-feral-gods`
- `GET /notes/220329192-this-inevitable-ruin/179929687-zayd-khan`

Repeated background probes:

- `GET /sign_in_prompt` returned 204.
- `GET /facebook_users/auth_status` returned 404.

Analytics/mutation-looking:

- `POST /notifications/track` returned 200.

## Form/Mutation Surfaces Found

These were discovered as forms/actions only. They were not submitted.

High-risk write surfaces:

- `POST /shelf/add_to_shelf`
- `POST /shelf/move_to_position`
- `POST /shelf/update/:shelf_id`
- `POST /review/update_list/:user_id`
- `POST /review/list/:user_id`
- `POST /review/destroy/:review_id-:slug`
- `POST /quotes/update_positions`
- `POST /comment`
- `POST /comment/delete_checked_comments`
- `POST /user_status`
- `POST /user_not_interested_works`
- `POST /user_shelves`
- `POST /user/edit_fav_genres`

Search/mention helpers:

- `GET /search`
- `GET /quotes/search`
- `GET /friend/find_friend`
- `POST /book/mention_search`
- `POST /author/mention_search`

Important nuance:

- The forms reveal CSRF-style `authenticity_token` fields and Rails-style nested params.
- The first CLI should expose read-only commands and dry-run/write-plan commands only. Actual writes need a second explicit approval design.

## Implementation Implications

The Goodreads CLI should be read-first and parser-heavy:

- `books list --shelf all|read|currently-reading|to-read`
- `books export`
- `reviews list`
- `quotes list`
- `comments list`
- `notes list`
- `notifications list`
- `friends requests`
- `topics list --scope groups`
- `profile show`
- `recommendations list`
- `api-map routes`

Local store should probably include:

- `books`
- `shelves`
- `reviews`
- `quotes`
- `comments`
- `notes`
- `notifications`
- `topics`
- `friends`
- `route_observations`

Good first parser targets:

1. `/review/list/:user_id` shelf pages, because they expose book tables and tooltip resource IDs.
2. `/tooltips`, because it batches `Book.<id>` resources.
3. `/quotes/list`, because it shows all 30 current user quotes and quote position IDs.
4. `/notes/:user_id/load_more`, because it is already an XHR pagination endpoint.
5. `/user/delayable_user_show/:user_id`, because it is a profile-specific XHR endpoint.

## Reproducibility

The capture used `browser-harness-js` against the existing logged-in Chrome session:

1. Create or reuse a Goodreads tab target.
2. Enable `Page` and `Network`.
3. Navigate each route sequentially.
4. Wait for page load and a short settle period.
5. Extract link/form metadata with `Runtime.evaluate`.
6. Write a local `0600` JSON artifact without headers, cookies, or bodies.

Navigation extraction reproducibility:

1. Navigate `home`, `profile`, `my_books_all`, `my_books_read`, and `notes_index`.
2. Extract `a[href]` metadata with text, href, class, id, `data-reftag`, and visibility.
3. Bucket links with route/text regexes for shelves, profile menu, global nav, and books tools.
4. Treat `nav-bookshelves-links-2026-05-22-v3.json` as the valid artifact; earlier nav artifacts are retained only as failure evidence.
5. Navigate `/genres?ref=nav_brws_genres` directly to resolve genre submenu routes instead of guessing hidden menu contents.

Summary extraction:

```bash
jq -r '.requests[] | select(.host=="www.goodreads.com") |
  [.routeLabel,.method,(.status|tostring),.resourceType,.path,(.queryKeys|join(","))] | @tsv' \
  goodreads/proofs/user-pages-map-2026-05-22.json | sort -u
```
