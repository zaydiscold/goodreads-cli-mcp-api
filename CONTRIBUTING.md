# Contributing

Goodreads CLI is currently being separated from a research-heavy development repository into a clean public product repository.

Contributions should focus on user-facing CLI behavior, parsers, safety, tests, installation, and documentation. Do not add raw route research or personal account material to the public tree.

## Before opening a pull request

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm check
```

Keep changes focused. A pull request should solve one concrete reader or maintainer problem and include the smallest useful test.

## Good public contributions

Examples include:

- a CLI bug fix with a regression test;
- a privacy-safe parser fixture;
- clearer authentication or error handling;
- human-readable output or stable JSON behavior;
- a task-specific Goodreads feature with explicit safety boundaries;
- package, installation, or release improvements;
- documentation that matches current behavior.

## Research boundary

Do not commit or paste into a public issue, pull request, fixture, log, or screenshot:

- Goodreads or Amazon cookies;
- CSRF or Rails authenticity tokens;
- private RSS keys;
- raw authenticated HTML or browser captures;
- request or response bodies copied from an authenticated session;
- Kindle highlight text;
- private review, comment, or message bodies;
- account IDs, private action URLs, local paths, or machine names;
- the complete endpoint inventory or discovery chronology.

Detailed route discovery belongs in the private source repository. Public code should contain only the task-specific route definitions required by shipped commands.

See [SECURITY.md](./SECURITY.md).

## Proposing a feature

Describe:

1. the user outcome;
2. the proposed CLI command;
3. whether it reads or changes account state;
4. the expected output;
5. the privacy-safe test or fixture;
6. the independent readback or rollback plan for a write.

MCP exposure is optional. Add it only when the capability is useful to agent clients. Do not create an MCP tool solely to maintain a one-to-one count with CLI commands.

## Write operations

Every account mutation must:

- remain a dry run by default;
- require explicit execution;
- require exact approval values when the target or payload is sensitive;
- emit a visible live-write warning;
- restrict credentials to the trusted Goodreads origin;
- define an independent readback when verification is possible;
- avoid reporting HTTP acceptance as account-state verification.

A write without a clear consent and verification story is not ready to merge.

## Architecture

Put business logic in shared feature or application services. CLI commands and MCP tools should be thin adapters over those services.

The current development tree still contains a legacy shared engine and strict CLI-to-MCP parity tests. Preserve them while working in this repository. The clean public extraction will replace forced parity with a curated MCP registry and shared-service contract tests.

## Documentation style

- Explain what the tool does before how it is implemented.
- Put installation and runnable examples near the top.
- Keep MCP below the primary CLI workflow.
- Avoid slogans, manufactured hooks, and brittle counts.
- Do not put branch history, launch operations, internal audits, or personal examples in public docs.
- Use synthetic IDs and generic paths in examples.
