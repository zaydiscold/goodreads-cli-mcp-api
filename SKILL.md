---
name: goodreads-cli
description: Use the Goodreads CLI to search books, inspect reading data, manage shelves, update library state, and run carefully approved notes workflows. MCP support is optional.
triggers:
  - "goodreads-cli"
  - "search Goodreads"
  - "add this book to Goodreads"
  - "add to Want to Read"
  - "manage Goodreads shelves"
  - "update my Goodreads rating"
  - "export Goodreads books"
  - "Goodreads notes"
  - "Goodreads MCP"
---

# Goodreads CLI operator skill

Use the CLI for task-specific Goodreads work. Do not start with the route catalog, raw HTTP requests, browser captures, or MCP unless the task actually requires them.

## Core rules

1. Resolve the intended book explicitly. Do not silently choose among ambiguous editions.
2. Prefer a first-class CLI command over a generic request path.
3. Treat every account mutation as a dry run unless the user explicitly asked to execute it.
4. Never treat HTTP success as proof that Goodreads state changed.
5. Verify a live write with an independent readback whenever the command supports one.
6. Never expose credentials, private URLs, raw highlights, reviews, comments, messages, or account identifiers.

## Run from source

From the repository root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
node cli/dist/index.js --help
```

Until the package is published from the clean public repository, use `node cli/dist/index.js` in place of `goodreads-cli`.

## Public reads

Public discovery usually does not require account credentials.

```bash
node cli/dist/index.js search books \
  --query "Kindred Octavia Butler" \
  --json

node cli/dist/index.js book show <book-slug-or-id> --json
node cli/dist/index.js book similar <work-slug> --json
node cli/dist/index.js author show --author-slug <author-slug> --json
```

Search returns candidates. When title, author, edition, or format is ambiguous, present the candidates and obtain a selection before mutating a shelf or library record.

## Account reads

Authenticated reads use the local Goodreads session owned by the user.

```bash
node cli/dist/index.js shelves discover --json
node cli/dist/index.js books list --shelf read --json
node cli/dist/index.js recent-reading list --json
node cli/dist/index.js recent-reading notes --json
node cli/dist/index.js library show --book-id <id> --json
```

If authentication fails or Goodreads returns a challenge page, report the failure. Do not reinterpret it as an empty shelf, missing review, or successful lookup.

## Add to Want to Read

The Goodreads shelf name is `to-read`.

```bash
# Plan only
node cli/dist/index.js shelves add \
  --book-id <id> \
  --name to-read

# Execute only after explicit approval
node cli/dist/index.js shelves add \
  --book-id <id> \
  --name to-read \
  --execute
```

After a live write, verify membership through an authenticated library read or another supported readback. Do not rely on the response status alone.

## Bookstore or bookshelf photos

The CLI does not perform image recognition.

For a photo workflow:

1. Use an image-capable model or agent to identify likely title and author pairs.
2. Search Goodreads for each pair.
3. Present ambiguous candidates instead of guessing an edition.
4. Run the shelf command as a dry run.
5. Execute only the selections the user approved.
6. Verify the resulting shelf state.

This is one way to use the CLI, not its product identity.

## Ratings, reviews, and reading status

Use the first-class `library` commands. Inspect each command's current help before execution:

```bash
node cli/dist/index.js library --help
```

Writes remain dry-run by default and may require exact status, rating, review hash, or other approval inputs. Preserve those checks. Never log full private review text as evidence.

## Notes and highlights

Notes inspection should return metadata and counts rather than raw highlight text.

```bash
node cli/dist/index.js notes inspect \
  --fixture <sanitized-notes-page.html> \
  --json

node cli/dist/index.js notes publicize-plan \
  --book-id <id> \
  --approved-book-id <id> \
  --json
```

A live notes visibility change requires the explicit execution flag, an exact approved book ID, and the configured notes-write environment gate.

```bash
GOODREADS_ALLOW_NOTES_PUBLICIZE=1 \
node cli/dist/index.js notes publicize \
  --book-id <id> \
  --approved-book-id <id> \
  --execute \
  --json
```

Read the notes state back after execution. A request accepted by Goodreads is not enough.

## Authentication

Credentials are local-only. The tracked wrapper loads `~/.goodreads/auth.sh` when present.

```bash
chmod 600 ~/.goodreads/auth.sh
node scripts/goodreads-doctor.mjs
```

Do not copy auth values into prompts, MCP configuration, issue bodies, logs, screenshots, fixtures, or repository files.

## Optional MCP mode

Use MCP only when an agent client benefits from tool discovery. It is an adapter over the same operations, not a separate product.

```bash
corepack pnpm build
scripts/goodreads-mcp.sh
```

The default profile is read-only. Other profiles change discovery scope but do not disable write approvals.

Prefer the smallest useful profile:

```bash
GOODREADS_MCP_PROFILE=core scripts/goodreads-mcp.sh
GOODREADS_MCP_PROFILE=notes scripts/goodreads-mcp.sh
GOODREADS_MCP_PROFILE=full scripts/goodreads-mcp.sh
```

## Output and privacy

Safe output may include:

- public book and author metadata;
- shelf names and bounded counts;
- operation plans;
- confidence and warnings;
- sanitized verification results.

Do not output:

- Goodreads or Amazon cookies;
- CSRF or authenticity tokens;
- private RSS keys;
- raw highlight or note text;
- private review, comment, or message bodies;
- private action URLs;
- account-specific IDs unless the user explicitly needs the value for the immediate command.

## Development and missing capabilities

When a task is not supported:

1. Describe the missing reader outcome.
2. Do not fall back to arbitrary route execution by default.
3. Add or request a task-specific command with a privacy-safe test.
4. Keep detailed endpoint discovery and raw captures in the private research repository.
5. Export only the minimum runtime contract needed by the public CLI.

See `AGENTS.md`, `CONTRIBUTING.md`, and `SECURITY.md` for development rules.
