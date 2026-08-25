# Public and private repository boundary

## Decision

The full Goodreads route-research corpus will not be part of the public CLI repository.

The current repository contains that corpus in its present Git history. It should become the private development source after the public product is extracted. Do not rename this repository to `goodreads-cli` and continue using it as the public launch repository.

Create a new, clean-history public repository named `goodreads-cli`.

## What “private API map” can realistically mean

The complete research corpus can be private:

- browser and CDP captures;
- raw or lightly sanitized authenticated responses;
- curl experiments;
- endpoint inventories;
- per-endpoint Markdown;
- evidence chronology;
- request-shape experiments;
- failed hypotheses;
- internal verification and rollback receipts.

An open-source client cannot conceal the endpoint paths and request fields it actually sends. Anyone can inspect the source, binary, or network traffic. The public repository therefore has three possible models:

1. **Recommended:** publish the CLI source with only the minimum task-specific route constants it needs, while keeping the complete discovery corpus private.
2. Publish only closed-source binaries. This hides source details but reduces trust, auditability, and contribution value.
3. Route all commands through a private hosted backend. This hides client-side routes but introduces operating cost, account trust, availability, and terms-of-service risk.

Use model 1. The goal is to keep the research product private, not to pretend the runtime is opaque.

## Current coupling that must be removed

The current source tree still depends on `api-map/`:

- the CLI build copies the complete directory into `cli/dist/api-map`;
- route loading searches for YAML files inside that directory;
- the CLI exposes route inventory and route-search commands;
- MCP exposes route inventory, browser-route, and generic request tools;
- the public engine exports a generic route executor.

Deleting `api-map/` before replacing these dependencies will break the build and runtime.

## Private source repository

The current repository should become private and retain the development history needed to maintain the product.

Suggested name:

```text
goodreads-cli-source
```

It may contain:

- the complete route-research tree;
- private exporter scripts;
- historical audits and evidence ledgers;
- internal migration notes;
- reversible-write receipts containing only sanitized metadata;
- the full source history.

No secret belongs in Git, including private Git. Cookies, CSRF tokens, private RSS keys, raw personal notes, and authenticated pages containing personal content remain local-only.

## Clean public repository

The public repository should contain only what a user or contributor needs:

```text
goodreads-cli/
  .github/
    workflows/ci.yml
  src/
    auth/
    commands/
    features/
    mcp/
    output/
    parsers/
    cli.ts
  test/
    fixtures/
  docs/
    auth.md
    automation.md
    commands.md
    safety.md
    troubleshooting.md
  AGENTS.md
  CHANGELOG.md
  CONTRIBUTING.md
  LICENSE
  README.md
  SECURITY.md
  package.json
  pnpm-lock.yaml
  tsconfig.json
```

Do not copy these into the public repository:

- `api-map/`;
- browser-route inventories;
- raw request or response captures;
- per-endpoint research pages;
- generic curl reproduction libraries;
- dated internal audits;
- branch and launch handoff documents;
- machine-specific paths or host instructions;
- personal Goodreads IDs or slugs;
- arbitrary route execution tools.

## Public runtime contract

Replace the complete map with task-specific route definitions owned by the feature that uses them.

Example:

```ts
export const addToShelfRoute = {
  method: "POST",
  path: "/shelf/add_to_shelf",
  authenticated: true,
  mutatesAccount: true,
} as const;
```

A small generated JSON manifest is acceptable if several features share it, but it should not become a second public API map. It should include only the routes used by shipped commands and only the fields required at runtime.

The public build must not parse OpenAPI or copy research directories into the package. Once the migration is complete, remove the runtime `yaml` dependency if no other feature uses it.

## Public CLI surface

The public product should be task-first.

Keep commands such as:

- search and inspect books;
- list and manage shelves;
- inspect and update library state;
- export reading data;
- inspect notes metadata;
- perform explicitly approved notes workflows;
- run diagnostics;
- start optional MCP mode.

Remove from the public product:

- `api-map routes`;
- `api-map search`;
- browser-route inventory;
- arbitrary `request plan` and `request execute`;
- dynamic route-inventory guidance;
- package exports that expose the internal generic executor.

These capabilities may remain in the private source repository for maintainers.

## MCP boundary

MCP is a feature of the CLI, not a separate public identity.

The clean public package should preferably expose MCP through the same installation, for example:

```bash
goodreads mcp
```

MCP tools should call the same feature services as the CLI, but they do not need one-to-one parity with every command. Expose a curated set that is useful to agents. Keep the default read-only.

The present source tree still enforces full CLI-to-MCP parity. Preserve that until the public extraction replaces the current registry and tests with shared-service contract tests.

## Migration sequence

1. Back up the current repository and confirm the desired private owner/name.
2. Stop adding new research artifacts to the public branch.
3. Complete security and correctness hardening in the current source tree.
4. Make the current repository private. This reduces future exposure but does not erase prior public copies.
5. Create a new empty public repository named `goodreads-cli`.
6. Copy only the product code and public documentation into a new working tree with no inherited `.git` directory.
7. Replace map lookups with task-specific route definitions.
8. Remove public route inventory, browser inventory, and generic request commands.
9. Replace forced CLI/MCP parity with shared-service tests and a curated MCP registry.
10. Remove personal paths, IDs, slugs, receipts, and historical audits.
11. Flatten or simplify the package layout so one install provides the CLI and optional MCP mode.
12. Add a real install path, initially npm, plus a package smoke test.
13. Run `pnpm pack --dry-run`, unpack the tarball, and inspect every included path.
14. Run secret scanning against the complete new public history.
15. Publish an initial prerelease only after CI and package smoke tests pass.
16. Update profile links, sibling repositories, and launch material to the new public URL.

## Required public checks

The public CI should fail when any of these checks fail:

- type checking, linting, formatting, unit tests, and builds;
- repository-specific secret scanning;
- no research-only paths in the repository or package;
- no absolute local paths or personal account identifiers;
- no unknown files in the npm tarball;
- writes remain dry-run by default;
- exact write approvals remain enforced;
- MCP defaults to read-only;
- command help and package import smoke tests pass.

## Versioning

Treat the clean public repository as a new product release, not as proof of an established external compatibility contract. A prerelease or `0.x` release is more honest until installation, authentication, output, and update behavior are stable for people other than the maintainer.
