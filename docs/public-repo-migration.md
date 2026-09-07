# Public repository migration

This is the operator checklist for turning the current development repository into a private source tree and creating a clean public Goodreads CLI.

## Final state

### Private source repository

The current repository becomes private and retains:

- full route research;
- browser and request experiments;
- historical evidence and audits;
- internal exporter and maintenance tools;
- the complete development history.

Suggested name:

```text
goodreads-cli-source
```

### Public product repository

Create a new repository with clean history:

```text
goodreads-cli
```

It contains the CLI, optional MCP feature, sanitized tests, task-specific route definitions, and user documentation. It does not contain the full API map or research history.

## Do not do these things

- Do not rename the current repository to `goodreads-cli` and leave it public.
- Do not assume deleting `api-map/` removes it from prior Git history.
- Do not publish either npm package from the current repository.
- Do not preserve internal route commands only to claim compatibility before a real public release.
- Do not put launch copy, personal machine paths, account IDs, or branch archaeology in the public docs.
- Do not claim that the CLI itself identifies books in photographs.

## Phase 1: stabilize the private source tree

1. Finish correctness and security work that is already in progress.
2. Run the complete check:

   ```bash
   corepack pnpm install --frozen-lockfile
   corepack pnpm check
   ```

3. Confirm the secret scanner covers tracked files and current history.
4. Remove personal account IDs, user slugs, machine paths, and local host instructions from tracked operator docs.
5. Record the source commit used for the public extraction.
6. Back up the repository outside GitHub.
7. Change the current repository visibility to private.

Making the repository private prevents additional casual exposure. It does not retract previously public Git objects or clones.

## Phase 2: create a clean public working tree

1. Create an empty public repository named `goodreads-cli`.
2. Create a new local directory with no copied `.git` directory.
3. Copy only the files needed by the product.
4. Flatten the package layout unless the workspace provides a real publishing advantage.
5. Make one package provide the CLI and optional MCP mode.
6. Keep `goodreads-cli` as a compatibility binary alias if the preferred command becomes `goodreads`.
7. Start the new repository with a small, reviewable initial commit history.

Recommended public tree:

```text
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

## Phase 3: remove research coupling

1. Identify every feature that currently loads a route from `api-map/`.
2. Give each shipped feature an explicit task-specific route definition.
3. Remove the build step that copies the complete map into `dist`.
4. Remove runtime OpenAPI parsing.
5. Remove `yaml` from production dependencies if it is no longer used.
6. Remove these public surfaces:

   - route inventory;
   - route search;
   - browser-route inventory;
   - arbitrary request planning;
   - arbitrary request execution;
   - generic route executor package exports.

7. Keep equivalent maintainer utilities only in the private source repository.
8. Add a CI rule that rejects `api-map`, capture archives, curl research, and historical audit paths in the public tree and package.

## Phase 4: simplify the application architecture

1. Split the large shared engine into feature services such as books, shelves, library, notes, and exports.
2. Keep Commander commands as input and output adapters.
3. Make MCP call the same feature services.
4. Replace mandatory one-to-one CLI/MCP parity with tests proving that registered MCP tools use the shared services.
5. Curate the MCP tool set around useful agent workflows.
6. Keep MCP read-only by default.
7. Import version information from package metadata or generated build metadata instead of hardcoding it in the CLI entry point.
8. Remove public `baseUrl` options when execution accepts only the exact Goodreads origin.
9. Export a narrow package API instead of re-exporting the complete internal engine.

## Phase 5: improve the install and operator experience

The biggest gap between the current repository and a polished CLI is distribution, not copywriting.

Minimum first release:

```bash
npx -y @zaydiscold/goodreads-cli --help
```

Add:

- an npm package with a verified file allowlist;
- `goodreads doctor` inside the CLI instead of a repository script as the primary path;
- `goodreads auth status` and a documented credential store;
- human-readable output by default;
- `--json` for scripts and agents;
- noninteractive behavior and stable exit codes;
- package import and installed-binary smoke tests;
- a concise changelog.

Homebrew and standalone binaries can follow after npm installation is dependable.

## Phase 6: public documentation

The public README should follow this order:

1. Name and literal one-sentence description
2. Install
3. Quick start
4. Common commands
5. Authentication
6. Automation and JSON output
7. Optional MCP
8. Safety and unofficial-project disclaimer
9. Development

Do not open with a slogan or a manufactured personal anecdote. A short, truthful reason for building the tool can appear later, but the first screen should explain what the program is and how to run it.

Public docs should be task-based. Do not copy:

- authenticated route-map audits;
- improvement audits;
- issue-resolution reports;
- token-efficiency research;
- launch handoffs;
- raw evidence ledgers;
- per-endpoint Markdown;
- personal machine or account details.

## Phase 7: package inspection

Before publishing:

```bash
corepack pnpm check
corepack pnpm --filter @zaydiscold/goodreads-cli pack --dry-run
```

Then create and unpack the tarball locally. Verify that it contains only intended runtime files, type declarations, the package README, license, and required metadata.

Reject the release if the tarball contains:

- route research;
- captures or proofs;
- authenticated fixtures;
- private IDs or paths;
- development-only scripts;
- MCP fixtures containing private content;
- source maps or generated files that expose unintended material.

## Phase 8: GitHub settings

For the new public repository:

- Name: `goodreads-cli`
- Description: `Unofficial Goodreads CLI for books, shelves, reading data, and Kindle notes. Optional MCP support.`
- Topics: `goodreads`, `cli`, `books`, `reading`, `automation`, `typescript`, `mcp`
- Default branch: `main`
- Delete branches automatically after merge
- Prefer squash merges for a clean history
- Disable wiki and projects unless they are actively used
- Add branch protection after the initial import

Do not use `api`, `openapi`, or `reverse-engineering` as public product topics.

## Phase 9: first release

Use a prerelease or `0.x` release until installation, authentication, output, and write verification work for another person from a clean machine.

Release acceptance criteria:

- clean install from the published package;
- `--help` and `--version` work;
- at least one public read works without auth;
- auth diagnostics fail clearly without credentials;
- a shelf write remains a dry run by default;
- MCP starts from the same installation and defaults to read-only;
- Node support matches the package declaration;
- CI and package smoke tests are green;
- the public repository contains no full map or research corpus.

## Phase 10: launch material

Use a real screen recording or screenshot of the CLI doing something useful. Keep the post literal.

A photograph workflow is a good follow-up demo when paired with an image-capable agent, but it should not be presented as built-in computer vision or as the entire reason the CLI exists.

The repository should be useful before the post is clever.
