# AGENTS.md — Goodreads CLI (MCP + API) developer/maintainer runbook

This is the in-repo runbook for anyone (human or agent) working **on** this
codebase. For operating the tool, read [`SKILL.md`](./SKILL.md); for the
project pitch, read [`README.md`](./README.md). When in doubt, this file is the
source of truth for layout, build/test, and the invariants you must not break.

## What this repo is

An unofficial **API map + CLI + MCP server** for the logged-in Goodreads web
surface. Amazon shut the public Goodreads API to new keys in December 2020, so
there is no official API to call. The headline artifact is the hand-mapped
surface in [`api-map/`](./api-map/); the CLI and MCP server are two thin front
ends that prove the map is real and complete enough to drive.

## Repository layout

```
api-map/        OpenAPI 3.1 spec, per-endpoint Markdown, curl, CDP captures — the product
cli/            @zaydiscold/goodreads-cli — the TypeScript CLI + the shared engine
  src/
    engine.ts       THE SHARED ENGINE — every operation, returns CommandEnvelopes
    index.ts        commander entrypoint; wires the command groups
    commands/*.ts   thin commander wrappers — each just parses args and calls engine.ts
    client/         live.ts (request plan/execute) + http.ts (GET helper)
    parsers/        one parser per page type (shelf, book, notes, messages, comments, rss)
    shelf.ts        shared shelf-page read/summarize helpers (books + recent-reading)
    workflows/      recent-reading join + notes-publicize workflow plans
    risk.ts         route -> risk level + the live-mutation stderr warning
    lib.ts          envelope(), route-map loaders, search, static write plans
  test/         vitest — parsers, engine smoke, and the CLI<->MCP parity guard
mcp/            @zaydiscold/goodreads-mcp — the MCP server (thin adapters over engine.ts)
docs/           auth, gotchas, write-operations, exports, rate-limits, etc.
fixtures/       local authenticated HTML captures (gitignored; never committed)
proofs/         sanitized run proofs (counts/status/timing only — no highlight text)
```

## The two invariants (do not break these)

1. **One engine, full parity.** All operation logic lives in
   [`cli/src/engine.ts`](./cli/src/engine.ts) and returns a `CommandEnvelope`.
   The CLI commands and the MCP tools are **thin adapters** — they parse inputs
   and call an engine function, nothing more. A capability must never live on
   one surface only. The `CAPABILITIES` registry in `engine.ts` is the contract,
   and [`cli/test/parity.test.ts`](./cli/test/parity.test.ts) fails CI if any
   capability is missing a CLI command **or** an MCP tool (in either direction).

   **To add a capability:** add an `engine.ts` function + a `CAPABILITIES` entry,
   then wire a `commands/*.ts` subcommand **and** a `mcp/src/server.ts`
   `registerTool` for it. The parity test tells you if you forgot one.

2. **Safety: reads are free, writes gate.** Reads run live. Every write builds a
   dry-run plan by default. Notes publicize/hide require all three gates —
   `--execute`, an exact `--approved-book-id`, and `GOODREADS_ALLOW_NOTES_PUBLICIZE=1`
   (enforced in `checkPublicizeApproval`). Quote writes default to dry-run and
   need `--execute`. Output must **never** contain raw highlight text, comment
   bodies, cookies, CSRF tokens, or private URLs.

## Build / test / typecheck

```bash
pnpm install
pnpm build         # builds the CLI (tsc + copies api-map into dist) then the MCP server
pnpm typecheck     # cli typecheck -> cli build -> mcp typecheck (mcp needs cli's dist .d.ts)
pnpm test          # vitest: parsers + engine + parity
pnpm lint          # eslint over cli/src + mcp/src
pnpm format        # prettier --write
```

Requires **Node >= 20** and **pnpm**. The MCP package imports the CLI's built
output via the package `exports` map (`@zaydiscold/goodreads-cli/engine`, `/lib`,
`/live`, `/risk`, `/workflows`), so **you must build the CLI before the MCP
typechecks** — `pnpm typecheck` already orders this for you.

> **Rebuild after editing the route map or the engine.** The runtime reads
> `cli/dist/` (the build copies `api-map/` into `cli/dist/api-map/`). Editing
> source without `pnpm build` is a silent no-op.

## Adding a route to the map

1. Add the path to `api-map/openapi/undocumented/goodreads-web.yaml` (and a
   Markdown page under `api-map/markdown/`).
2. Mark mutations: any `POST/PUT/PATCH/DELETE` is treated as account-mutating
   (`lib.ts:isMutation`); add a summary note for the rare GET that mutates.
3. Wire a capability (see invariant #1) if agents/users should drive it.
4. `pnpm build && pnpm test`, then live-verify with a reversible action only.

## MCP registration

```bash
# Claude Code:
claude mcp add goodreads-cli -s user -- node /abs/path/to/repo/mcp/dist/server.js
# Hermes:
hermes mcp add goodreads --command node --args /abs/path/to/repo/mcp/dist/server.js
```

Live tool truth is `tools/list` (currently 28). Pass auth via env when you need
live writes: `GOODREADS_COOKIE`, `GOODREADS_CSRF_TOKEN`, and
`GOODREADS_ALLOW_NOTES_PUBLICIZE=1` for the notes workflow. See
[`SKILL.md`](./SKILL.md) §1–§2 for the CDP auth-extraction flow.

## Naming convention & lineage

**Convention (shared across the personal CLI repos).** The GitHub slug is `<venue>-cli-mcp-api` and the
README H1 reads **"<Venue> CLI (MCP + API)"** — e.g. Goodreads CLI (MCP + API), Robinhood CLI (MCP + API),
plus the AllTrails / GoDaddy / Squarespace siblings. The npm package and bin names stay
`@zaydiscold/<venue>-cli` / `<venue>-cli`; only the GitHub slug and the README title carry the
`(MCP + API)` branding, and GitHub auto-redirects the old slugs.

**Lineage — Printing Press is a starting point, not a cage.** The CLI + skill + MCP trio pattern is
borrowed from [Matt Van Horn's Printing Press](https://github.com/mvanhorn/cli-printing-press), and these
repos use it as a *seed* — not a spec we only follow. The API map here is hand-extended well past anything
a generator produced, and we may spin up separate repos to keep building on top of what's here rather than
conforming back to the generator. The map is the product; Printing Press just gave us a good place to start.

## House rules

- Keep fixtures and any raw captures in the gitignored `fixtures/` — promote only
  sanitized, tested behavior to `cli/`, `mcp/`, `docs/`, and `proofs/`.
- Match the existing style: thin commands, enveloped output, one parser per page
  type, plan-by-default writes.
- Document undocumented-surface discoveries in `docs/undocumented-surface.md`.
