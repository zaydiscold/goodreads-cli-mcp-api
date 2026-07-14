# @zaydiscold/goodreads-mcp

Private stdio MCP server over the Goodreads CLI shared engine.

Build from the repository root because the MCP imports the CLI's generated
exports:

```bash
pnpm install
pnpm build
scripts/goodreads-mcp.sh
```

The tracked wrapper sources the mode-600 `~/.goodreads/auth.sh` file at runtime,
rebuilds stale or missing generated artifacts, and keeps all build output off
MCP stdout. Windows uses `scripts\goodreads-mcp.cmd`.

## Profiles

`GOODREADS_MCP_PROFILE` controls discovery cost without changing tool behavior:

- `full` (default): all 28 legacy tools.
- `core`: eight common route/books/notes tools, about 71% fewer discovery tokens.
- `notes`: thirteen notes/annotations/recent-reading tools, about 51% fewer.

MCP results are compact JSON by default. Set `GOODREADS_MCP_OUTPUT=pretty` only
for debugging. The human-facing CLI remains pretty-printed.

Live truth is always `tools/list`; exact profile membership is defined and
tested in `src/profile.ts`.

## Write boundary

- Reads run live; writes produce dry-run plans by default.
- Notes publicize/hide require `execute`, exact book approval, and
  `GOODREADS_ALLOW_NOTES_PUBLICIZE=1`.
- The generic executor requires `execute`, exact `approvedRoute`, and
  `GOODREADS_ALLOW_GENERIC_WRITES=1` for mutations.
- Credentials are sent only to `https://www.goodreads.com`; credentialed
  cross-origin redirects are rejected.
- An accepted HTTP response is never reported as mutation verification. Reload
  and verify account state after every write.

Run the real stdio integration suite with:

```bash
pnpm --filter @zaydiscold/goodreads-mcp test
```
