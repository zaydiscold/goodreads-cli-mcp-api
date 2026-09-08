# Goodreads CLI consolidation, 2026-09-07

## Source decisions

Inspected 38 open and closed pull requests and 26 issues, remote branches, and local worktrees. Integrated current main cb24e5e with PR #60 and the existing local release-hardening branch ef251a3. PR #61 is explicitly marked DO NOT MERGE and was excluded; its useful source changes were already represented in the integrated stack. Public PRs and issues were not changed.

## Corrected and added behavior

- CLI-first source entry and shared exported engine with optional MCP. Both adapters expose review append and comment creation.
- Authenticated observations require the exact book update form. Book IDs from edit/update URLs are never reported as review IDs.
- Explicit other-user RSS lookups cannot be overwritten with the logged-in owner's state; book matching uses exact boundaries.
- Clearing a rating or review is verified only from an observed empty control. Missing HTML, failed reads, or wrong-book forms cannot prove success. Replacement review text uses canonical hash equality on authenticated readback.
- Append previews bind both the existing review hash and the resulting content hash. A changed original blocks execution. Both replacement and append preserve successful form controls, including flags, dates, and private notes, internally. Preview/receipt output does not include the original text or notes.
- Comment counts deduplicate actual comment-record links, exclude navigation, and distinguish zero observed records from a verified empty collection.
- New `comments create` uses exact review-ID and text-hash approval, validates the live form target, and returns submitted_unverified plus mutationVerified:false. Transport receipts omit raw redirects. Relative and trusted absolute form actions are accepted.
- Generic and note writes explicitly report mutationVerified:false until semantic readback exists.
- MCP uses SDK 1.30.0, a read-only default profile, and a full profile with 41 tools. Comment creation is only in the full profile.

## Evidence and reproducibility

`pnpm check` passes dependency audit, secret scan, lint, formatting, TypeScript, 115 CLI tests, 14 MCP tests, two runtime tests, and a clean rebuild. An additional supported pnpm 11 dependency audit reports no known vulnerabilities at the moderate threshold.

Tests reproduce false-clear receipts, exact account/book selection, append preconditions, preservation of review flags/private notes, absolute form actions, comment approval, and redirect privacy. Mutations are mocked. No account content was modified.

Live proof: an owned background tab in the operator's currently logged-in Chrome read an existing review edit form and comment form. The edit form identifies the book in its update action; the review-show URL identifies the review. The comment form posts to /comment with type=review, id, comment[body_usertext], and session CSRF. The CLI returned authenticated review/rating observations; an append preview returned hashes and lengths only. A separate MCP client returned a structured library result and advertised the new comment tool.

Reproduce using your own Goodreads-only cookie in a local ignored .env:

```sh
pnpm install --frozen-lockfile
pnpm check
node --env-file=.env cli/dist/index.js library show --book-id BOOK_ID
node --env-file=.env cli/dist/index.js library review --help
node cli/dist/index.js comments create --help
```

The real Chrome remains the session source. Cookie values can contain literal quotes; retain those bytes when writing an environment file. A JSON-escaped cookie literal is not an equivalent Cookie header.

Packaging proof: CLI and MCP packed and installed into an empty directory. CLI help, side-effect-free API import, comment preview, and MCP initialization succeeded. No .env, local/, research/, or proofs/ paths appeared in the tarballs. Packages remain private until the distribution boundary is approved.

## Privacy and remaining limits

Replaced the operator's profile ID, private email, local machine labels, and profile slug with synthetic examples in current tracked research, fixtures, routes, and docs. Current exact-value checks found no remaining profile-ID/private-email hits. Gitleaks scanned all 135 historical commits without credential-pattern findings, but that does not remove previously committed personal identifiers. This development repository still contains historical research; current-file sanitation alone does not clear its history for promotion.

No live public comment, rating, shelf update, or review edit was submitted. Comment semantic readback and edit/delete contracts remain unverified. A proposed temporary public comment test still needs an approved exact text/target and a verified cleanup path. Missing evidence is labeled explicitly, not presented as a working verified mutation.

No bulk test may post or modify other people's content. Account-specific pages and dropdown states need separate observations. The present evidence covers selected live workflows and fixtures, not every route in the map.

## Installed local runtime proof

The clean source checkout was fast-forwarded to dccdbb2 and rebuilt. Its installed `scripts/goodreads-mcp.sh` bootstrap loaded the existing mode-600 auth file and returned a high-confidence library result with ratingObserved, reviewObserved, authenticatedSuccess, and stateObserved all true, with no warnings. The doctor confirmed fresh build artifacts and discoverable tools; its only warnings were the expected local revisions not yet pushed to origin. The default profile exposes 28 read tools; the full profile exposes 41 tools.

## Follow-up regression check

Rechecked local main at `f60e252` against the original cleanup `ef251a3` and freshly fetched origin. Both original cleanup commits are ancestors of local main. The newer exact-book checks, observed-field verification, review append, comment preview, and CLI-first documentation remain present. Local main was 72 commits ahead of origin before this repair, with no incoming origin commits.

Two regressions were repaired:

- Wrong-book HTML correctly prevented mutation verification but left `sourceResults[].ok` true. A new test reproduced the contradictory evidence record; the rejected source now reports false.
- A clean build generated `cli/dist/index.js` without execute permission. The installed CLI symlink then failed with permission denied, despite Node-based checks passing. The CLI build now sets the executable mode. A temporary-directory test runs the real build-copy script against a fresh non-executable entry point and executes the resulting binary on POSIX.

Added four further tests that allow review preflight and mocked submission to succeed, then fail the post-write read with an offline response, unrelated HTML, a wrong-book form, or a missing review field. All remain indeterminate. These complement the older tests, which now stop at preflight following the review-preservation changes.

Verification: `corepack pnpm check` passed on Node 22.22.3 with 120 CLI tests, 14 MCP tests, and three runtime tests, plus audit, scanner, lint, formatting, type checking, integrity, and clean builds. The installed CLI returned its version and completed a live book search with the expected book present. The tracked MCP wrapper initialized and advertised 28 default read tools.

Current live-account limitation: an MCP library lookup returned low confidence with no exact form observed. A subsequent authenticated shelf request timed out; retrying via the homepage explicitly returned a Goodreads anti-bot/WAF challenge. This run does not establish fresh authenticated account-read success, despite the earlier installed-runtime proof above. No authentication material was printed or replaced, and no live mutation was sent. Public search remained successful.
