# Goodreads CLI

Search books, manage shelves, inspect reading data, and automate carefully gated Goodreads workflows from the terminal.

The CLI is the primary product surface. The repository also includes an optional MCP adapter that calls the same engine.

## Run from source

From the repository root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
node cli/dist/index.js --help
```

Until the package is published, replace `goodreads-cli` below with `node cli/dist/index.js` unless you link the local binary.

## Common workflows

### Search for a book, then inspect it

```bash
goodreads-cli search books --query "Kindred Octavia Butler" --json
goodreads-cli book show <book-slug-or-id> --json
goodreads-cli book similar <work-slug> --json
```

Search returns bounded candidates. It does not silently decide which edition is correct.

### Add a book to Want to Read

```bash
goodreads-cli shelves add --book-id <id> --name to-read
goodreads-cli shelves add --book-id <id> --name to-read --execute
```

The first command is a dry run. The second sends the live write.

### Inspect shelves and reading history

```bash
goodreads-cli shelves discover --json
goodreads-cli books list --shelf read --json
goodreads-cli stats year-in-books --user-id <id> --year 2025 --json
goodreads-cli recent-reading list --json
```

### Inspect and publicize Kindle notes

```bash
goodreads-cli notes inspect --fixture <notes-page.html> --json
goodreads-cli notes publicize-plan \
  --book-id <id> \
  --approved-book-id <id> \
  --json

GOODREADS_ALLOW_NOTES_PUBLICIZE=1 \
goodreads-cli notes publicize \
  --book-id <id> \
  --approved-book-id <id> \
  --execute \
  --json
```

The CLI emits metadata and counts, not raw highlight text.

## Command families

| Family | Purpose |
| --- | --- |
| `search`, `book`, `author`, `recommendations` | Public discovery and metadata |
| `shelves`, `books`, `stats` | Shelf inventory, exports, and reading history |
| `library` | Reading status, ratings, and reviews |
| `notes`, `recent-reading`, `annotations` | Kindle-note and highlight workflows |
| `quotes` | Quote creation, removal, and ordering |
| `comments`, `messages` | Redacted account metadata |
| `api-map`, `request`, `write-plan` | Advanced development, route inspection, and explicit raw plans |

Use `goodreads-cli <family> --help` to inspect subcommands.

## JSON output

Commands emit a stable envelope with source, timestamp, confidence, warnings, and data. This makes the CLI usable from shell scripts, cron jobs, and agents without maintaining a second parsing layer.

## Authentication

Public discovery commands can run without account credentials. Authenticated reads and writes use your own Goodreads session.

Keep auth in `~/.goodreads/auth.sh` with mode `600`. Never commit cookies, CSRF tokens, private RSS keys, raw authenticated pages, or personal reading content.

See [`docs/auth.md`](../docs/auth.md) and run:

```bash
node scripts/goodreads-doctor.mjs
```

## Write safety

- Writes are dry-run by default.
- Live writes require `--execute`.
- Sensitive workflows also require exact approval values and narrow environment flags.
- Every accepted write still requires a readback before it is considered verified.
- `--dry-run` wins over `--execute`.

See [`docs/write-operations.md`](../docs/write-operations.md) and [`SECURITY.md`](../SECURITY.md).

## Optional MCP adapter

```bash
scripts/goodreads-mcp.sh
GOODREADS_MCP_PROFILE=core scripts/goodreads-mcp.sh
GOODREADS_MCP_PROFILE=notes scripts/goodreads-mcp.sh
GOODREADS_MCP_PROFILE=full scripts/goodreads-mcp.sh
```

With no profile set, the MCP server exposes the read-only tool set. Profiles change discovery, not the underlying engine or write approvals.

See [`mcp/README.md`](../mcp/README.md).
