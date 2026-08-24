# Goodreads CLI

> Your reading life, scriptable.

[![CI](https://github.com/zaydiscold/goodreads-cli-mcp-api/actions/workflows/ci.yml/badge.svg)](https://github.com/zaydiscold/goodreads-cli-mcp-api/actions/workflows/ci.yml)
[![Node 20+](https://img.shields.io/badge/node-%3E%3D20-43853d)](./cli/package.json)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

An unofficial TypeScript CLI for searching books, managing shelves, exporting reading data, and automating Goodreads workflows. An optional MCP adapter exposes the same engine to agents.

I built this because I wanted to point an agent at a bookstore photo, review the matches, and send the books I liked to **Want to Read**. I also wanted my homelab to handle repetitive Kindle-note workflows without turning every automation into a browser project.

```bash
goodreads-cli search books --query "The Dispossessed Ursula K. Le Guin"
goodreads-cli shelves add --book-id <id> --name to-read
goodreads-cli shelves add --book-id <id> --name to-read --execute
```

The first shelf write is a dry run. The second is live.

[Quick start](#quick-start) · [Workflows](#what-you-can-do) · [Safety](#writes-are-deliberately-boring) · [MCP](#optional-mcp-for-agents) · [Docs](#documentation)

## What you can do

| Workflow | What the CLI handles |
| --- | --- |
| **Bookstore photo to Want to Read** | Pair an image-capable agent with `search books`, review the candidates, then use `shelves add`. The CLI does not pretend image or title matching is certainty and never silently chooses an edition. |
| **Reading data from the shell** | Inspect books, shelves, ratings, yearly stats, recommendations, and public book metadata with structured JSON output. |
| **Kindle notes automation** | Join recent reading with the notes index, inspect visibility counts, build a publicize plan, then execute only behind explicit approvals. Raw highlight text is not emitted. |
| **Scheduled jobs** | Use stable JSON envelopes and the tracked daily-sync script from cron, a homelab, or another automation runner. |
| **Agent access** | Start the optional MCP adapter. CLI and MCP call one shared engine, so their behavior and safety gates stay aligned. |

This is not a generic CLI generator. It is a concrete reading tool with a tested Goodreads surface behind it.

## Quick start

```bash
git clone https://github.com/zaydiscold/goodreads-cli-mcp-api.git
cd goodreads-cli-mcp-api

corepack pnpm install --frozen-lockfile
corepack pnpm build

node cli/dist/index.js --help
node scripts/goodreads-doctor.mjs
```

Requires Node.js 20 or newer. Source installation is the supported path today. Replace `goodreads-cli` in the examples with `node cli/dist/index.js` unless you link the local binary.

The CLI package is intentionally marked private until the detailed route research is separated from the public runtime artifact. See [Route-catalog separation](./docs/api-map-separation.md).

### Authentication

Public book and discovery reads do not need your Goodreads session. Account reads and writes do.

Store local auth in `~/.goodreads/auth.sh`, keep that file out of the repository, and start integrations through `scripts/goodreads-mcp.sh`. The wrapper loads auth at runtime so cookies and CSRF values do not have to be copied into agent configuration.

See [Authentication](./docs/auth.md) for the current setup and run `node scripts/goodreads-doctor.mjs` before attempting a live write.

## A few useful commands

```bash
# Search and inspect
goodreads-cli search books --query "Parable of the Sower Octavia Butler" --json
goodreads-cli book show 52397-parable-of-the-sower --json
goodreads-cli book similar <work-slug> --json

# Shelves
goodreads-cli shelves discover --json
goodreads-cli shelves add --book-id <id> --name to-read          # dry run
goodreads-cli shelves add --book-id <id> --name to-read --execute

# Reading history
goodreads-cli stats year-in-books --user-id <id> --year 2025 --json
goodreads-cli recent-reading list --json
goodreads-cli recent-reading notes --json

# Notes and highlights
goodreads-cli notes inspect --fixture <notes-page.html> --json
goodreads-cli notes publicize-plan --book-id <id> --approved-book-id <id> --json
```

The command surface also covers ratings, reviews, reading status, quotes, recommendations, authors, comments, and redacted message metadata. See the [CLI guide](./cli/README.md) and [command contracts](./docs/cli-command-contracts.md).

## Writes are deliberately boring

A tool that can change a reading account should not be clever about consent.

- Mutating commands default to a dry run.
- Live writes require `--execute`.
- Sensitive workflows require an exact approval value and a narrow environment gate.
- Every live mutation warns on stderr.
- A successful HTTP response is not treated as proof. Read the account state back and verify it.

Example:

```bash
GOODREADS_ALLOW_NOTES_PUBLICIZE=1 \
goodreads-cli notes publicize \
  --book-id <id> \
  --approved-book-id <id> \
  --execute \
  --json
```

Outputs are redaction-first. The CLI does not print cookies, CSRF tokens, private URLs, raw highlight text, comment bodies, or message bodies.

Read [Write operations](./docs/write-operations.md), [Authentication](./docs/auth.md), and the [Evidence ledger](./docs/evidence-confidence-ledger.md) before automating account mutations.

## Optional MCP for agents

MCP is a feature, not the product name. The server defaults to the read-only profile when `GOODREADS_MCP_PROFILE` is unset.

```bash
corepack pnpm build

scripts/goodreads-mcp.sh
GOODREADS_MCP_PROFILE=core scripts/goodreads-mcp.sh
GOODREADS_MCP_PROFILE=notes scripts/goodreads-mcp.sh
GOODREADS_MCP_PROFILE=full scripts/goodreads-mcp.sh
```

Use `read` for the safest default, `core` for common reading workflows, `notes` for Kindle-note automation, and `full` for compatibility and development. Profiles control tool discovery only. They do not bypass write approvals.

The CLI and MCP adapter share [`cli/src/engine.ts`](./cli/src/engine.ts), and parity tests fail when one surface drifts from the other.

See [MCP agent surface](./docs/mcp-agent-surface.md) and [Token efficiency](./docs/token-efficiency.md).

## Architecture and the route-research boundary

The public product is **Goodreads CLI**. MCP is an adapter. Detailed route research is an implementation input.

The current build still reads and packages the repository's `api-map/` tree. Simply deleting that directory would break runtime route loading, and deleting it from the current branch would not erase it from Git history. The migration is therefore:

1. keep detailed captures, evidence, curl references, and discovery notes in a private research repository;
2. export a small, deterministic, privacy-reviewed runtime route manifest;
3. create a clean-history public `goodreads-cli` repository that ships only the CLI, optional MCP adapter, tests, and sanitized manifest.

The exact contract and cutover order are in [Route-catalog separation](./docs/api-map-separation.md).

## Documentation

- [CLI guide](./cli/README.md)
- [Authentication](./docs/auth.md)
- [Write operations](./docs/write-operations.md)
- [Exports](./docs/exports.md)
- [Rate limits](./docs/rate-limits.md)
- [MCP agent surface](./docs/mcp-agent-surface.md)
- [Route-catalog separation](./docs/api-map-separation.md)
- [Contributing](./CONTRIBUTING.md)
- [Security policy](./SECURITY.md)

## Related project

Pair it with [`amazon-kindle-cli-mcp-api`](https://github.com/zaydiscold/amazon-kindle-cli-mcp-api) for Kindle and Amazon-list workflows. Keep each public repository centered on its own CLI rather than turning either README into a product bundle.

## Status and disclaimer

This project is independent and unofficial. It is not affiliated with, endorsed by, or approved by Goodreads or Amazon.

Goodreads can change its web surface without notice. Automated or non-browser access may conflict with Goodreads' terms. Use the tool only with an account you control, keep request volume conservative, and understand the risk before enabling writes.

Provided as-is under the [MIT License](./LICENSE).
