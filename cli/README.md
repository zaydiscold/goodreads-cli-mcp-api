# Goodreads CLI

An unofficial command-line client for Goodreads.

The CLI can search books, inspect and manage shelves, read library data, update reading status, ratings, and reviews, export reading information, and support carefully approved notes workflows.

This package is private while the product is extracted from the current research-heavy source repository into a clean public repository.

## Run from source

From the repository root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
node cli/dist/index.js --help
```

Use `node cli/dist/index.js` in the examples below until the public package is released.

## Examples

### Search and inspect a book

```bash
node cli/dist/index.js search books \
  --query "Kindred Octavia Butler" \
  --json

node cli/dist/index.js book show <book-slug-or-id> --json
node cli/dist/index.js book similar <work-slug> --json
```

Search returns bounded candidates. It does not silently decide which edition is correct.

### Inspect shelves and reading data

```bash
node cli/dist/index.js shelves discover --json
node cli/dist/index.js books list --shelf read --json
node cli/dist/index.js stats year-in-books --user-id <id> --year 2025 --json
node cli/dist/index.js recent-reading list --json
```

### Add a book to Want to Read

```bash
# Dry run
node cli/dist/index.js shelves add \
  --book-id <id> \
  --name to-read

# Live write after explicit approval
node cli/dist/index.js shelves add \
  --book-id <id> \
  --name to-read \
  --execute
```

A live response is not proof that the shelf changed. Verify the result with an authenticated library or shelf read.

### Inspect notes metadata

```bash
node cli/dist/index.js notes inspect \
  --fixture <sanitized-notes-page.html> \
  --json

node cli/dist/index.js notes publicize-plan \
  --book-id <id> \
  --approved-book-id <id> \
  --json
```

The CLI emits metadata and counts rather than raw highlight text.

## Command groups

| Group | Purpose |
| --- | --- |
| `search`, `book`, `author`, `recommendations` | Public discovery and metadata |
| `shelves`, `books`, `stats` | Shelf inventory, exports, and reading history |
| `library` | Reading status, ratings, and reviews |
| `notes`, `recent-reading`, `annotations` | Notes and highlight workflows |
| `quotes` | Quote management |
| `comments`, `messages` | Redacted account metadata |

The current private source tree also contains route-catalog and generic-request commands used during development. Those are not intended for the clean public CLI.

Run `node cli/dist/index.js <group> --help` for current arguments and examples.

## Output

Commands return structured envelopes containing data, a generation time, confidence, and warnings. Use JSON output for scripts, scheduled jobs, and agents.

The clean public CLI should add useful human-readable output as the default while retaining stable `--json` output for automation.

## Authentication

Public discovery can run without account credentials. Authenticated reads and writes use a local Goodreads session owned by the user.

Keep credentials in `~/.goodreads/auth.sh` with mode `600`. Never commit or paste cookies, CSRF tokens, private RSS keys, authenticated HTML, private URLs, or personal reading content.

See [`docs/auth.md`](../docs/auth.md) and run:

```bash
node scripts/goodreads-doctor.mjs
```

## Write safety

- Writes are dry-run by default.
- Live writes require `--execute`.
- Sensitive workflows require exact approval values and narrow environment gates.
- Credentialed requests are restricted to the trusted Goodreads origin.
- Every accepted write requires a readback before it is considered verified.
- `--dry-run` wins over `--execute`.

See [`docs/write-operations.md`](../docs/write-operations.md) and [`SECURITY.md`](../SECURITY.md).

## Optional MCP feature

The repository contains an MCP adapter over the same application behavior. MCP is optional and should ship through the same public installation rather than being presented as a second product.

```bash
corepack pnpm build
scripts/goodreads-mcp.sh
```

With no profile set, the adapter exposes a read-only tool set. Other profiles change discovery scope but do not bypass write approvals.

See [`mcp/README.md`](../mcp/README.md).

## Public extraction

The clean public repository will remove the full route research, generic route execution, browser-route inventory, historical audits, personal operator data, and build-time coupling to `api-map/`.

See [`docs/public-repo-migration.md`](../docs/public-repo-migration.md).
