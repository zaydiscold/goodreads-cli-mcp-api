# Goodreads CLI launch handoff

This file is for the final operator or coding agent with full GitHub repository-settings access. It is deliberately procedural. Do not redesign the product during this handoff.

## Product decision

The public product is **Goodreads CLI**.

- Public repository name: `goodreads-cli`
- Tagline: **Your reading life, scriptable.**
- MCP remains an optional adapter over the same engine.
- The route catalog is implementation research, not the public brand.
- The sibling Amazon/Kindle project should be presented as a second, separate tool rather than bundled into the Goodreads launch claim.

## Non-negotiable compatibility rules

Before and after every repository-setting or naming change, preserve:

1. Every existing CLI command and subcommand.
2. Every existing engine capability key and package export.
3. All 40 legacy Goodreads MCP tool names.
4. The `full`, `core`, and `notes` MCP profiles.
5. The safer `read` profile added by the launch PR.
6. Dry-run defaults and exact approval gates for live account writes.
7. Redaction of cookies, CSRF tokens, raw Kindle highlights, private comments, and private message bodies.
8. Node 20 and Node 22 CI support.

Do not replace a working command with a renamed command unless the original remains as a compatibility alias.

## Canonical pull request

There must be one Goodreads launch PR targeting `main` directly. It should contain both:

- release hardening from the former `release/twitter-ready-20260824` branch;
- public branding and documentation from `brand/goodreads-cli-20260824`.

The branding branch already contains the complete release stack on top of `main`. Retarget that PR to `main`; do not merge the stacked release PR separately.

Before merge, verify:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm audit:security
corepack pnpm lint
corepack pnpm format:check
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Also verify the PR branch is ahead of `main` and not behind it.

## After the Goodreads PR merges

1. Confirm the merge commit is on `main`.
2. Re-run the full CI workflow on `main`.
3. Delete these remote branches once GitHub confirms they have no open PR:
   - `release/twitter-ready-20260824`
   - `brand/goodreads-cli-20260824`
   - `delilah/notes-books`
   - `feat/daily-watch-comments`
   - `feat/library-writes-complete`
   - `fix/authenticated-shelf-http-live-reads`
   - `fix/daily-reading-sync`
   - `fix/goodreads-path-segment-boundaries-20260823`
4. Leave only `main` unless a genuinely active follow-up branch exists.
5. Close the superseded launch PR and any stale issue that was either implemented by the canonical PR or deliberately rejected as unnecessary launch overengineering.

Do not force-push `main`.

## Repository rename and metadata

After the canonical PR is merged and `main` is green:

1. Rename `goodreads-cli-mcp-api` to `goodreads-cli` in GitHub repository settings.
2. Set the description to:

   `Unofficial Goodreads CLI for shelves, ratings, reviews, exports, and Kindle notes. Optional MCP support.`

3. Set topics:

   `goodreads`, `cli`, `books`, `reading`, `kindle`, `automation`, `mcp`, `typescript`

4. Keep the repository public only if the public/private route-catalog separation described in `docs/api-map-separation.md` is accepted. The current public Git history already contains route research, so deleting files from a new commit is not a privacy rewrite.
5. GitHub redirects the old repository URL, but still update every explicit link in:
   - this README and package metadata;
   - the Kindle repository;
   - profile or website links;
   - the X launch post and follow-up replies.

Use the canonical URL after rename:

`https://github.com/zaydiscold/goodreads-cli`

## Package and release state

- Keep npm publication disabled until `pnpm pack --dry-run` and an unpacked tarball inspection prove that no private fixture, proof, capture, or research corpus is included.
- Runtime version is `1.1.0`.
- Create tag `v1.1.0` only after the renamed repository's `main` CI is green.
- Release title: `Goodreads CLI v1.1.0`.
- Do not call the route count or tool count “100 APIs.” Use exact, current inventory only when independently measured.

## Sibling Kindle repository handoff

Repository: `zaydiscold/amazon-kindle-cli-mcp-api`

1. Merge its one canonical launch PR only after CI is green.
2. Change its default branch from `master` to `main`.
3. Rename it to `kindle-cli` if available; otherwise use `amazon-kindle-cli`.
4. Recommended description:

   `Unofficial Kindle and Amazon reading CLI for wishlists, Send to Kindle, library metadata, and Goodreads parity. Optional MCP support.`

5. Update all Goodreads links to the renamed `goodreads-cli` repository.
6. Keep old CLI commands and all legacy MCP tool names as compatibility surfaces.
7. Create tag `v0.3.0` only after CI on the renamed/default branch passes.

## X launch assets

The launch does not require a polished dry-run terminal recording. The simplest credible asset is:

1. a real bookstore or bookshelf photo;
2. a screenshot of the user asking an agent to identify the books and add selected matches to Goodreads;
3. a screenshot of the agent returning bounded candidate matches or confirming the chosen edition;
4. optionally, a final Goodreads shelf screenshot.

Do not claim that the CLI itself performs computer vision. The agent interprets the image; the CLI/MCP provides Goodreads search and account actions.

### Primary post

```text
Bookstore photos used to die in my camera roll.

I built an unofficial Goodreads CLI. Send a shelf photo to your coding agent, confirm the matches, and add the books to Want to Read without opening Goodreads.

It also handles shelves, ratings, reviews, exports, and Kindle notes/highlights.

https://github.com/zaydiscold/goodreads-cli
```

### First reply or quote-post

Use a reply when the Kindle project is supporting context. Use a quote-post later only if the Goodreads post has already earned meaningful engagement.

```text
I built the other half too: a Kindle/Amazon CLI for wishlists, Send to Kindle, library metadata, and Goodreads parity.

https://github.com/zaydiscold/kindle-cli
```

### Accuracy boundaries

- Photo understanding comes from the user's agent or multimodal model.
- Candidate selection should remain explicit when editions are ambiguous.
- Comments are redacted metadata unless a separately proven write workflow exists.
- Do not claim universal reliability against Goodreads or Amazon anti-bot changes.
- Do not claim a rounded API count.

## Final verification checklist

The operator should leave a final PR comment containing:

- final repository names and URLs;
- final default branches;
- exact merged PR numbers;
- exact release tags;
- Node 20 and Node 22 CI links;
- CLI help output confirming commands are present;
- MCP `tools/list` counts for every profile;
- confirmation that no live mutation was used for release verification;
- confirmation that stale branches and superseded PRs were removed or closed.
