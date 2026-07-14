# Goodreads — full API surface (live-captured 2026-05-28)

> Historical capture. The canonical map was expanded and several inferred notes methods were
> corrected on 2026-07-14. See
> [`docs/authenticated-api-map-2026-07-14.md`](../../docs/authenticated-api-map-2026-07-14.md).

Captured via CDP against a logged-in account. Goodreads is a Rails app: most reads are HTML
page routes, writes are Rails-UJS form POSTs (`data-remote`), and the modern book/rating/feed
widgets use an **AppSync GraphQL** endpoint
(`kxbwmqov6jgg3daaamb744ycu4.appsync-api.us-east-1.amazonaws.com/graphql`, `Authorization: <JWT>`).
Auth for legacy routes = session cookie (`_session_id2`) + CSRF token from the page meta tag.

All write commands in the CLI default to **dry-run**; live writes need `--live-write`.

## READ — navigable surface
| Area | Route |
|---|---|
| Home feed | `GET /` ; pagination `POST /home/load_more_updates` |
| My Books / shelves | `GET /review/list/:userId` (`?shelf=<name>`, `?ref=nav_mybooks`) |
| Review (single) | `GET /review/show/:id` ; edit form `GET /review/edit/:id` |
| Review drafts | `GET /review/drafts` |
| Reading stats | `GET /review/stats/:userId` |
| Find duplicates | `GET /review/duplicates` |
| Import/export page | `GET /review/import` ; CSV `HEAD/GET /review_porter/export/:id/goodreads_export.csv` |
| Year in Books | `GET /user/year_in_books/:year/:userId` |
| Reading challenge | `GET /readingchallenges` ; `GET /readingchallenges/goals/data` ; `/readingchallenges/quest` ; `POST /readingchallenges/getAchievementsCarouselData` |
| Kindle Notes & Highlights | `GET /notes` ; per-book `GET /notes/:bookSlug/:userSlug` ; `GET /notes/:id/load_more` |
| Profile | `GET /user/show/:userId` ; settings `GET /user/edit` ; fav genres `GET /user/edit_fav_genres` |
| Friends | `GET /friend` ; `/friend/user/:id` ; `/friend/of_friends` ; `/friend/show/:id` |
| Groups | `GET /group` ; `/group/list/:userId` ; `/group/show/:id` ; `/group/show_tag/:tag` ; `/group/popular` |
| Discussions / topics | `GET /topic` |
| Comments | `GET /comment/list/:userId` ; `/comment/index/:id` |
| Quotes | `GET /quotes` ; mine `GET /quotes/list` (`/quotes/list/:id`) ; `/quotes/tag/:tag` ; `/quotes/my_authors` ; `/quotes/friend_quotes` ; export `/quotes/goodreads_quotes_export.csv` |
| Recommendations | `GET /recommendations` ; friends' `GET /recommendations/to_me` |
| Lists (Listopia) | `GET /list` ; `/list/show/:id` ; `/list/tag/:tag` ; `/list/created/:userId` ; `/list/liked/:userId` |
| Giveaways | `GET /giveaway` ; `/giveaway/show/:slug` ; `/giveaway/history` |
| Books | `GET /book/show/:id` ; `/book/similar/:id` ; `/book/:id/reviews` ; `/book/friend_reading` |
| Authors | `GET /author/show/:id` ; `/author/list/:id` ; `/author/similar/:id` ; `/author/quotes/:id` ; `/author/topics/:id` |
| Genres | `GET /genres` ; `/genres/:genre` ; `/genres/list` |
| Notifications | `GET /notifications` |
| Messages | `GET /message/inbox` |
| Shelf editor | `GET /shelf/edit` |
| Best reviewers | `GET /user/best_reviewers` |

## WRITE — Rails-UJS form POSTs (captured from `data-remote` actions, never fired)
| Action | Endpoint |
|---|---|
| Shelve a book ("Want to Read") | `POST /shelf/add_to_shelf` (book_id + name) |
| Reorder shelf item | `POST /shelf/move_to_position` |
| Rename/edit shelf | `POST /shelf/update/:id` |
| Create / edit custom shelf | `POST /user_shelves` ; `POST /user_shelves/:id` |
| Post status / **update reading progress** | `POST /user_status` |
| Write / edit a review (+ **publicize**, spoiler flag) | `POST /review/update/:id` |
| Bulk-edit reviews | `POST /review/update_list/:id` ; `POST /review/list/:id` |
| Delete a review | `POST /review/destroy/:id` |
| Import reviews (CSV) | `POST /review/import` |
| Post a comment | `POST /comment` ; bulk delete `POST /comment/delete_checked_comments` |
| Add a friend | `POST /friend/add_as_friend/:id` ; remove `POST /friend/destroy/:id` ; invite `/friend/invite` |
| Enter a giveaway | `POST /giveaway/enter_choose_address/:slug` ; Kindle `/giveaway/enter_kindle_giveaway/:slug` |
| Add a quote | `POST /quotes/new` ; remove `/quotes/:slug/remove` ; reorder `/quotes/move_{up,down,top,bottom}/:id` ; `/quotes/update_positions` |
| Create a list | `POST /list/new` |
| Create a group | `POST /group/new` |
| Vote in a poll | `POST /poll/answer/:slug` |
| Edit favorite genres | `POST /user/edit_fav_genres` |
| Update profile | `POST /user/update` |
| Mark "not interested" | `POST /user_not_interested_works` |
| Batch-move messages | `POST /message/move_batch` |
| Follow a book-link / reorder | `POST /book_link/edit_list` ; `/book_link/follow/:id` ; `/book_link/order/:id` |

## GraphQL (AppSync)
- **Reads:** `getUser`, `getReviews`, `myReviewCard`, `getSimilarBooks`, `getGiveaways`,
  `getFeaturedBookLists`, `getPopularBookLists`, `getBookListsVotedOnByFriends`,
  `getSiteHeaderBanner`, `GetAdsTargeting`.
- **Mutations (captured earlier this session):** `RateBook` (set star rating, 1–5),
  `UnrateBook` (clear rating). Send `Authorization: <JWT>` (the app's AppSync token, not the
  session cookie).

## Not captured (runtime-bound)
- **"Like" an update** in the feed — bound by a React fetch handler at runtime, not present as a
  static UJS form. Requires a live click to capture the exact endpoint; left as a CLI command stub
  pending a confirmed capture (likely `POST /rating` or a GraphQL `like` mutation) so we never
  fire a real "like" against someone's feed just to map it.

## Notes
- Legacy POSTs need the CSRF token: read `<meta name="csrf-token">` from any page, send as
  `X-CSRF-Token` (or `authenticity_token` form field).
- IDs in routes are masked here (`:id`, `:userId`, `:slug`); the live capture in
  `cdp-capture-2026-05-28-*.txt` has the concrete instances.
