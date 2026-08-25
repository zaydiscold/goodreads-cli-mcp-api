# Changelog

## Unreleased - public repository split

- Defined **Goodreads CLI** as the product name. MCP remains an optional integration.
- Stopped presenting the complete endpoint map as a public product artifact.
- Marked the current repository as the private development and research source for a new clean-history public `goodreads-cli` repository.
- Removed slogan-first and bookstore-photo-first launch copy from the product documentation. Photo workflows remain an optional agent-assisted use case, not built-in computer vision or the CLI's identity.
- Removed personal account IDs, user slugs, machine paths, and host-specific instructions from tracked operator documentation.
- Documented the removal of route inventory, browser-route inventory, arbitrary request execution, full-map packaging, and forced CLI-to-MCP parity from the future public product.
- Kept package publication disabled until the clean public package passes tarball inspection and clean-machine installation tests.

The clean public repository should start with a concise product changelog. The historical entries below remain useful inside this private source repository but should not be copied wholesale into the public tree.

## Unreleased - 2026-08-23 (HTTP origin hardening)

- Restricted every shared Goodreads HTTP helper to the exact HTTPS origin `https://www.goodreads.com` before any network request is sent.
- Replaced automatic redirect following with bounded, same-origin redirect handling so authenticated and public-safe cookie jars cannot cross an origin boundary.
- Added focused regression coverage for direct custom-origin requests, deceptive hostnames, cleartext URLs, embedded credentials, and cross-origin redirects.

## Unreleased - 2026-08-23 (daily watch)

- `comments list --user-slug` and `goodreads_comments_list` now read the authenticated recent-post page live instead of returning a plan-only null parse.
- Live output remains redaction-first: comment counts and link/form shape only, never comment bodies.
- Added focused engine coverage and updated the evidence ledger for the unified daily reading/annotations/comments watchdog.

## Unreleased - 2026-08-23

### Daily reading sync hardening

- Fixed authenticated shelf parsing when Goodreads renders a cover-image link before the textual `a.bookTitle`; live HTML now returns all seven current titles instead of `null`.
- Moved the WSL cron helper from the repository root to `scripts/goodreads-daily-sync.sh`, removed machine-specific defaults, made writes atomic, and kept explicit success/failure receipts.
- Simplified the README's stale v1 token table into current MCP profile guidance and added compact navigation.

## Unreleased - 2026-08-22

### Similar books read surface

- Added `book similar <work-slug>` and `goodreads_similar_books` over one shared engine.
- Parses Goodreads' public `ReactComponents.SimilarBooksList` hydration props into bounded book/work identity and rating metadata.
- Excludes the source work, duplicates, descriptions, reviews, and image URLs; ships in `full` and `core` MCP profiles.
- Live-read verified against `GET /book/similar/{work_slug}` without account cookies or browser runtime dependencies.

## Unreleased - 2026-08-01

### Bookstore haul and Kindle parity

- Demonstrated an agent-assisted photo workflow: identify candidate titles, resolve Goodreads IDs, and add approved books to Want to Read.
- Paired the workflow with the sibling Kindle/Amazon project for list-parity experiments.
- Added library writes for status, rating, and review workflows.

## Unreleased - 2026-07-27

### Shelf add and remove

- Added first-class `shelves add` and `shelves remove` CLI commands plus corresponding MCP tools in the current private source registry.
- Uses the shelf form route with `book_id`, shelf name, and the remove action where applicable.
- Verified the request and readback workflow against the maintainer's account using reversible test data. Personal IDs and titles are intentionally omitted here.

### Auth hardening

- Account mutations send the expected browser-origin headers.
- Live Rails mutations can refresh CSRF state from the authenticated session before submission.
- Failed writes return sanitized errors without exposing credentials or private response content.
- Added authentication, write-operation, and troubleshooting documentation.

## 1.0.0 - 2026-07-14

First internal stable release of the paired route research, CLI, and MCP development source.

### Agent efficiency

- Added `full`, `core`, and `notes` MCP profiles over one shared engine.
- Reduced routine MCP discovery size by introducing smaller profiles.
- Kept compact MCP output, bounded route results, and summarized browser-route output as defaults.

### API, CLI, and MCP development

- Expanded the private authenticated route research and AppSync operation catalog.
- Corrected notes-related request contracts using browser and client-source evidence.
- Paired CLI and MCP behavior through the current shared engine and parity tests.

### Safety and runtime

- Restricted credentials to the exact Goodreads origin and rejected credentialed cross-origin redirects.
- Prevented CSRF form-field injection into custom-origin requests.
- Kept mapped writes dry-run by default with route-specific approval gates.
- Added build-aware launchers for generated MCP output.

### Verification

- CLI and MCP tests passed on the maintainer's supported systems and GitHub CI.
- Live account testing used reversible actions and independent readbacks where supported.
