# AGENTS.md - Goodreads CLI development guide

This file is for humans and coding agents working on the repository. Read `README.md` for the user-facing overview, `CONTRIBUTING.md` for contribution rules, and `SECURITY.md` for the data boundary.

## Product direction

The product is **Goodreads CLI**.

- The CLI is the primary interface.
- MCP is an optional integration over shared application services.
- The full endpoint map, browser captures, curl experiments, and research chronology are private development material.
- The future public repository must have clean history and contain only the product code, sanitized fixtures, tests, and the minimum route definitions required at runtime.
- Do not use `CLI + MCP + API` as the product name.
- Do not describe the route map as the product.

The current repository still contains the legacy research tree and compatibility surfaces. Preserve working behavior while preparing the split, but do not add new public dependencies on the full `api-map/` corpus.

## Current layout

```text
api-map/        Legacy route research. Move to the private source repository.
cli/            TypeScript CLI, parsers, clients, workflows, and shared engine.
mcp/            Repository-local MCP adapter.
docs/           User docs mixed with historical research and audits.
scripts/        Build, doctor, secret-scan, and wrapper scripts.
```

The public extraction should be smaller and task-oriented:

```text
src/            CLI commands, application services, parsers, auth, and MCP integration.
test/           Unit, contract, fixture, and package smoke tests.
docs/           Installation, auth, commands, automation, safety, and troubleshooting.
.github/        CI and concise issue/PR templates.
```

Do not copy historical audits, branch handoffs, raw captures, per-endpoint research pages, personal machine notes, or account-specific receipts into the public repository.

## Current architecture

Most behavior currently flows through `cli/src/engine.ts`. Commander commands and MCP tools call the same engine functions, and the current parity tests require every registered capability to appear on both surfaces.

That is a compatibility constraint of the present source tree, not the long-term product model. During the public extraction:

1. Move business logic into feature-focused application services.
2. Keep CLI commands thin.
3. Let MCP call the same services.
4. Expose a curated MCP subset instead of forcing every CLI command to become a tool.
5. Remove generic route-map and raw request execution from the public product.
6. Export only deliberate, stable package entry points.

Until that refactor lands, update the capability registry and parity tests whenever current shared behavior changes.

## Safety invariants

These rules are non-negotiable:

1. Account writes are dry-run by default.
2. A live write requires explicit execution and exact approval values where applicable.
3. HTTP acceptance is not account-state verification.
4. Every supported live mutation needs an independent readback or a clearly documented verification limit.
5. Credentialed traffic is restricted to the exact trusted Goodreads origin.
6. Redirects carrying credentials must remain on that origin.
7. Responses and fixture inputs remain bounded.
8. Output must not contain cookies, CSRF tokens, private RSS keys, raw highlights, review bodies, comment bodies, message bodies, private URLs, or account-specific action links.
9. No personal account ID, username, local filesystem path, host name, or machine-specific command belongs in tracked public documentation.

Use synthetic identifiers in tests and examples.

## Route-research boundary

The complete map is not a public artifact.

Private source material may include sanitized discovery notes and experiments, but secrets and raw personal reading content still remain local-only and outside Git.

The public CLI may include only the endpoint constants and request shapes required by its task-specific commands. An open-source client cannot hide the paths it calls, so do not claim complete route secrecy. The goal is to keep the research corpus private, not to pretend the runtime is opaque.

Do not add new user-facing commands such as route inventory, browser capture inventory, or arbitrary request execution to the public extraction.

## Build and verification

From the repository root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm check
```

`pnpm check` runs:

- dependency audit;
- repository-specific secret scan;
- ESLint;
- Prettier check;
- TypeScript checks;
- CLI and MCP tests;
- production builds.

The current MCP package depends on generated CLI output, so the root scripts intentionally build the CLI before checking or testing MCP.

## Adding or changing behavior

For a user-facing capability:

1. Start with the reader outcome, not an endpoint name.
2. Decide whether it is a read, plan, safe write, or destructive write.
3. Implement the behavior in a shared application/service layer.
4. Add a thin CLI command.
5. Add MCP exposure only when it is useful for agents.
6. Add privacy-safe tests and fixtures.
7. Define post-write verification before enabling execution.
8. Update user documentation without exposing research evidence or personal data.

For current-tree changes that touch the legacy capability registry, keep the existing CLI and MCP adapters consistent until the public extraction removes the forced parity model.

## Documentation rules

Public-facing documentation should be literal and useful:

- name the task the tool performs;
- show installation early;
- use real command examples;
- keep MCP below the primary CLI workflow;
- keep implementation research out of the product pitch;
- avoid brittle route, tool, token, or endpoint counts;
- do not invent a personal hook for marketing copy.

Historical evidence, dated audits, and launch-operation notes belong in the private source repository or issue tracker, not in the public documentation tree.

## Release rule

Do not publish the npm package or rename this repository to `goodreads-cli` while it still contains the full route-research history.

The release sequence is defined in `docs/public-repo-migration.md`.
