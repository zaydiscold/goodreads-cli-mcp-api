# Contributing

Goodreads CLI accepts focused fixes, parsers, tests, command improvements, and documentation changes.

The public repository is for the product, not raw endpoint-research material.

## Before opening a pull request

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm format:check
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Keep changes narrow enough that the behavior and safety boundary can be reviewed.

## Public contribution boundary

Good public contributions include:

- a CLI command or parser with bounded, privacy-safe fixtures;
- a bug fix with a regression test;
- clearer error handling or readback verification;
- documentation that reflects current behavior;
- a sanitized route-manifest update produced by the private export process.

Do not commit or paste into a pull request, issue, fixture, log, or screenshot:

- Goodreads cookies or individual cookie values;
- CSRF or Rails authenticity tokens;
- private RSS keys;
- raw authenticated HTML or browser captures;
- Kindle highlight text, review text, comments, or message bodies;
- account IDs, annotation pair IDs, private action URLs, or personal file paths;
- request headers or response bodies copied from an authenticated session.

See [`SECURITY.md`](./SECURITY.md) for the complete boundary.

## Proposing a new capability

Open a redacted issue that explains:

1. the user outcome;
2. whether the operation reads or writes;
3. the expected CLI shape;
4. what can be verified after the operation;
5. what privacy-safe fixture or test can prove it.

Do not attach raw captures. Detailed discovery belongs in the maintainer's private route-research workspace. The public change should contain only the sanitized runtime contract, implementation, and tests.

## Write operations

Every account mutation must:

- default to a dry run;
- require `--execute` for a live request;
- use exact approval values for sensitive targets;
- emit a visible live-write warning;
- define an independent readback;
- avoid treating HTTP success as state verification;
- preserve the existing origin, redirect, and credential boundaries.

A new write without a rollback and verification story is not ready to merge.

## CLI and MCP parity

The CLI is the primary interface. MCP is optional, but both use the same engine.

When a capability is exposed on both surfaces, update the shared capability registry and parity tests. Do not duplicate business logic in the MCP server.

## Style

- Prefer one concrete user outcome over broad framework language.
- Keep the root README focused on using the CLI.
- Put advanced route-catalog and MCP details after the main workflows.
- Avoid brittle feature counts in marketing copy.
- Keep generated files deterministic and clearly labeled.
