# Goodreads CLI

An unofficial command-line client for Goodreads.

It can search books, manage shelves, update reading status, ratings, and reviews, export reading data, and support Kindle notes workflows. The same core can also run as an optional MCP server for agent clients.

[![CI](https://github.com/zaydiscold/goodreads-cli-mcp-api/actions/workflows/ci.yml/badge.svg)](https://github.com/zaydiscold/goodreads-cli-mcp-api/actions/workflows/ci.yml)
[![Node 20+](https://img.shields.io/badge/node-%3E%3D20-43853d)](./cli/package.json)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

> **Development repository:** this repository still contains the full route-research corpus used while building the CLI. It is not the final public distribution repository, and its packages should not be published from here. The intended public repository is a clean-history `goodreads-cli` project containing only the product code, sanitized fixtures, and the minimum runtime route definitions it actually needs.

## Quick start from source

```bash
git clone https://github.com/zaydiscold/goodreads-cli-mcp-api.git
cd goodreads-cli-mcp-api

corepack pnpm install --frozen-lockfile
corepack pnpm build

node cli/dist/index.js --help
```

Node.js 20 or newer is required. The npm package is intentionally private while the public and private repository split is completed.

## Examples

```bash
# Search and inspect books
node cli/dist/index.js search books \
  --query "Parable of the Sower Octavia Butler" \
  --json

node cli/dist/index.js book show 52397-parable-of-the-sower --json

# Inspect shelves and reading data
node cli/dist/index.js shelves discover --json
node cli/dist/index.js stats year-in-books --user-id <id> --year 2025 --json

# Plan a shelf change, then execute it explicitly
node cli/dist/index.js shelves add --book-id <id> --name to-read
node cli/dist/index.js shelves add --book-id <id> --name to-read --execute

# Inspect notes metadata without printing highlight text
node cli/dist/index.js notes inspect --fixture <notes-page.html> --json
```

Run `node cli/dist/index.js <command> --help` for the current command contract.

## What it covers

- Book search, book metadata, similar books, authors, and recommendations
- Shelf discovery, shelf membership, reading status, ratings, and reviews
- Reading exports and Year in Books data
- Notes, annotations, quotes, and recent-reading workflows
- Stable JSON output for scripts and scheduled jobs
- An optional MCP adapter over the same underlying operations

The CLI itself does not perform computer vision. A bookstore or bookshelf photo workflow uses an image-capable agent to identify candidate titles, then uses the CLI to search Goodreads and apply the selected shelf action.

## Authentication

Public discovery commands do not require an authenticated Goodreads session. Account reads and writes do.

Local credentials are loaded from `~/.goodreads/auth.sh` by the tracked wrappers. Keep that file outside the repository with owner-only permissions. Never paste cookies, CSRF tokens, private RSS keys, authenticated HTML, private URLs, or personal reading content into issues, pull requests, logs, or screenshots.

See [Authentication](./docs/auth.md) and run:

```bash
node scripts/goodreads-doctor.mjs
```

## Writes

Account mutations are intentionally explicit:

- A mutating command produces a dry-run plan by default.
- A live request requires `--execute`.
- Sensitive operations also require exact approval values and a narrow environment gate.
- HTTP success is not treated as proof that account state changed.
- Every live mutation should be followed by an independent readback.

Example:

```bash
GOODREADS_ALLOW_NOTES_PUBLICIZE=1 \
node cli/dist/index.js notes publicize \
  --book-id <id> \
  --approved-book-id <id> \
  --execute \
  --json
```

Read [Write operations](./docs/write-operations.md), [Authentication](./docs/auth.md), and the [Evidence ledger](./docs/evidence-confidence-ledger.md) before automating account mutations.

## Optional MCP support

MCP is an integration feature, not the product name. The repository-local adapter exposes selected Goodreads operations to compatible agent clients and defaults to a read-only profile when `GOODREADS_MCP_PROFILE` is unset.

```bash
corepack pnpm build
scripts/goodreads-mcp.sh

GOODREADS_MCP_PROFILE=core scripts/goodreads-mcp.sh
GOODREADS_MCP_PROFILE=notes scripts/goodreads-mcp.sh
GOODREADS_MCP_PROFILE=full scripts/goodreads-mcp.sh
```

Profiles affect tool discovery. They do not bypass write approvals.

See [MCP agent surface](./docs/mcp-agent-surface.md).

## Public and private repository split

The full endpoint map, browser captures, curl experiments, evidence chronology, and exploratory notes should not ship in the public CLI repository.

The clean public repository should contain:

- the CLI and its task-specific commands;
- shared services and parsers;
- the optional MCP integration;
- sanitized fixtures and tests;
- only the minimum route definitions required at runtime;
- user-facing documentation.

The current repository should become the private development and research source after the public tree has been extracted. Deleting `api-map/` from a new commit would not remove it from this repository's existing public Git history.

There is also a hard technical limit: an open-source CLI necessarily reveals the endpoint paths it calls. The practical boundary is to keep the complete research corpus private while publishing only the small set of route constants required by user-facing commands. Keeping every route completely undisclosed would require a closed-source binary or a private hosted backend.

See [Public repository migration](./docs/public-repo-migration.md).

## Development

```bash
corepack pnpm check
```

That runs the dependency audit, repository-specific secret scan, linting, formatting check, type checking, tests, and builds.

Contributor guidance is in [CONTRIBUTING.md](./CONTRIBUTING.md). Security boundaries are in [SECURITY.md](./SECURITY.md).

## Disclaimer

This project is independent and unofficial. It is not affiliated with, endorsed by, or approved by Goodreads or Amazon.

Goodreads can change its web surface without notice. Automated or non-browser access may conflict with Goodreads' terms. Use the tool only with an account you control, keep request volume conservative, and understand the risk before enabling writes.

MIT licensed. See [LICENSE](./LICENSE).
