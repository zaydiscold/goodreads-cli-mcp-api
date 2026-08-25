# Optional MCP support for Goodreads CLI

This directory contains the repository-local MCP adapter for Goodreads CLI.

MCP is an integration feature. It is not a separate product and should eventually ship from the same public package and installation as the CLI.

## Run from the current source repository

The adapter currently imports generated CLI output, so build from the repository root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
scripts/goodreads-mcp.sh
```

The wrapper loads `~/.goodreads/auth.sh` at runtime when present, rebuilds missing or stale generated files, and keeps build output away from MCP stdout. Windows uses `scripts\goodreads-mcp.cmd`.

## Profiles

`GOODREADS_MCP_PROFILE` controls the current tool-discovery set:

- unset or `read`: read-only tools;
- `core`: common books, shelves, and notes operations;
- `notes`: notes, annotations, and recent-reading operations;
- `full`: the legacy complete registry used for development and compatibility inside this source repository.

Profiles do not bypass write gates. Mutating tools still produce dry-run plans by default and require explicit execution and exact approvals.

MCP output is compact JSON by default. Set `GOODREADS_MCP_OUTPUT=pretty` only for debugging.

## Safety boundary

- Credentials are sent only to the exact trusted Goodreads origin.
- Credentialed cross-origin redirects are rejected.
- Writes remain dry-run by default.
- Sensitive writes require exact approval values and narrow environment gates.
- HTTP acceptance is not reported as account-state verification.
- Cookies, CSRF tokens, private URLs, highlights, reviews, comments, and messages must not appear in tool output or logs.

See `../SECURITY.md` and `../docs/write-operations.md`.

## Public product direction

The clean public repository should expose MCP through the main installation, preferably with a command such as:

```bash
goodreads mcp
```

The public MCP registry should be curated around useful agent workflows. It does not need a one-to-one tool for every CLI command.

Do not carry these development-only MCP surfaces into the public product:

- complete route-map inventory;
- browser-route inventory;
- arbitrary request execution;
- dynamic route-inventory guidance;
- research-only fixture and evidence tools.

The default public MCP mode should remain read-only, and all tools should call the same feature services used by the CLI.

See `../docs/public-repo-migration.md`.

## Tests

```bash
corepack pnpm --filter @zaydiscold/goodreads-mcp test
```
