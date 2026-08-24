# Goodreads MCP adapter

Optional stdio MCP access to the Goodreads CLI shared engine.

Build from the repository root because the adapter imports the CLI's generated exports:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
scripts/goodreads-mcp.sh
```

The tracked wrapper sources the mode-600 `~/.goodreads/auth.sh` file at runtime, rebuilds stale or missing generated artifacts, and keeps build output off MCP stdout. Windows uses `scripts\goodreads-mcp.cmd`.

## Profiles

`GOODREADS_MCP_PROFILE` controls discovery cost without changing the underlying engine:

- unset or `read`: read-only tools;
- `core`: common books, shelves, and notes workflows;
- `notes`: notes, annotations, and recent-reading workflows;
- `full`: every registered tool for compatibility and development.

Exact profile membership and current counts are defined and tested in `src/profile.ts`. Live truth is always `tools/list`.

Profiles do not bypass write gates. A profile can expose a mutating tool while the tool itself still defaults to a dry run and requires exact approvals for execution.

MCP results are compact JSON by default. Set `GOODREADS_MCP_OUTPUT=pretty` only for debugging. The human-facing CLI remains pretty-printed.

## Write boundary

- Live-capable reads send requests when required inputs and auth are present. Fixture, catalog, and plan tools remain local.
- Writes produce dry-run plans by default.
- Notes publicize and hide require `execute`, exact book approval, and `GOODREADS_ALLOW_NOTES_PUBLICIZE=1`.
- The generic executor requires `execute`, exact `approvedRoute`, and `GOODREADS_ALLOW_GENERIC_WRITES=1` for mutations.
- Credentials are sent only to `https://www.goodreads.com`; credentialed cross-origin redirects are rejected.
- An accepted HTTP response is never reported as mutation verification. Reload and verify account state after every write.

See `../docs/evidence-confidence-ledger.md` and `../SECURITY.md`.

Run the stdio integration suite with:

```bash
pnpm --filter @zaydiscold/goodreads-mcp test
```
