# Goodreads CLI (MCP + API)

> "i made all this so I can have a cron job on the homelab setup that auto publishes my kindle highlights and notes :)"

An unofficial **API map + CLI + MCP server** for the logged-in Goodreads web surface — shelves, books, ratings, reviews, quotes, and Kindle notes & highlights — driven from the terminal or from your agents, without ever opening the website. Amazon closed the public Goodreads API to new keys in December 2020, so this drives the web surface from a hand-mapped OpenAPI spec: a TypeScript CLI **and** an MCP server sharing one engine. **The map is the headline; the CLI and MCP are the proof it's real.**

---

## ⚠️ Disclaimer

**This is an independent, unofficial project. It is NOT affiliated with, endorsed by, or approved by Goodreads or Amazon.**

- **Unofficial surface.** Amazon closed the public Goodreads API to new keys in December 2020. This tool drives the *logged-in web surface* (HTML pages, RSS, CSV exports, Rails-UJS form POSTs, and the newer AppSync GraphQL ops) mapped by hand. Goodreads can rename or rotate any of it without notice — trust live reads over memory.
- **Your own account, at your own risk.** It acts on the account you're already logged into, using your own browser cookie + CSRF token. Automated/non-browser access may be against Goodreads' Terms of Service. Use it on your own account and understand the risk.
- **Writes can change your account.** Publicizing/hiding notes, moving shelves, and quote edits mutate your real account. Every write defaults to a dry-run; the notes workflow is gated three ways (below).
- **No warranty.** Provided "as is". See [LICENSE](LICENSE).

---

## Install

```bash
git clone https://github.com/zaydiscold/goodreads-cli-mcp-api.git
cd goodreads-cli-mcp-api
corepack pnpm install
corepack pnpm build
node cli/dist/index.js --help     # or link the bin: goodreads-cli --help
```

Requires **Node ≥ 20** and the repository-pinned pnpm, available through
**Corepack**. Start the MCP through the tracked
`scripts/goodreads-mcp.sh` wrapper; it loads local auth at runtime and builds stale
or missing generated artifacts before opening stdio.

## What it does

Full read **and** write across Goodreads:

- **Shelves** — discover your shelf inventory + counts; list and export shelves (HTML pagination or RSS), deduped by book with per-shelf membership.
- **Books** — parse any public book page (JSON-LD + Next.js metadata).
- **Kindle Notes & Highlights** — inspect notes metadata, plan + execute publicize/hide (gated), and join your current/read shelves to your notes index.
- **Annotations** — per-highlight annotation metadata (visibility, spoiler, persist endpoints) without raw highlight text.
- **Quotes** — add, remove, and reorder your quotes (up/down/top/bottom).
- **Ratings & Reviews** — searchable modern AppSync **GraphQL** operation metadata (`RateBook`/`UnrateBook`, catalog-only until freshly recaptured) plus mapped web review routes.
- **Comments & Messages** — inspect comment/message route + form shape without emitting bodies.
- **Raw route driving** — plan or execute mapped Goodreads-web routes directly; AppSync entries are intentionally discovery-only.

Everything is **redaction-first**: output carries counts, status, timing, link shapes, and route metadata — never raw highlight text, comment bodies, cookies, CSRF tokens, or private URLs.

## CLI ↔ MCP parity — one engine, no drift

The thing that makes this more than a script: **the CLI and the MCP server share a single engine** ([`cli/src/engine.ts`](./cli/src/engine.ts)). Every command is a thin wrapper that calls an engine function; every MCP tool is the same. They emit the **identical** enveloped JSON, so an agent and a human get the same answer the same way — and the two surfaces **cannot drift**.

That invariant is enforced by code, not vigilance: a `CAPABILITIES` registry in the engine is checked **in both directions** by [`cli/test/parity.test.ts`](./cli/test/parity.test.ts) — every capability must have a CLI command **and** an MCP tool, with no orphans on either side. Add a command without its MCP twin and CI goes red.

Live tool truth is always `tools/list`; the tested `full` profile currently exposes 28 tools.

For cron-based automation on WSL, see [`wsl-sync.sh`](./wsl-sync.sh) — a daily sync script that pulls reading data to your Windows Desktop.

## Command tour — what answers what

All reads run live and free. All writes default to a dry-run; the notes workflow needs the three explicit gates below.

| Command | The question it answers |
|---|---|
| `api-map routes` / `api-map search "<q>"` | "What can this drive?" — 114 mapped web operations plus 10 searchable AppSync catalog entries |
| `api-map browser-routes` | "What did the authenticated CDP capture see?" — sanitized route templates |
| `shelves discover` | "What shelves do I have, and how many books in each?" |
| `books list --shelf <s>` | "List one shelf" — from authenticated HTML fixtures or public RSS |
| `books export --fixture-dir <d>` | "Export my shelves" — deduped by book, with per-shelf membership + completeness flags |
| `book show <slug-or-id>` | "Parse this book page" — JSON-LD + Next.js metadata |
| `recent-reading list / notes` | "Join my current/read shelves to my Kindle notes index" |
| `recent-reading publicize-plan / publicize` | "Plan, then publicize, my recent books' highlights" (gated) |
| `notes inspect` | "What's in this notes page?" — counts + visibility, no highlight text |
| `notes publicize-plan` | "Build the verified plan for one book's notes" |
| `notes publicize` / `notes hide` | "Make all highlights public / hidden for a book" (gated) |
| `annotations list / thoughts-plan` | "Per-highlight annotation metadata; plan a per-note thought" |
| `quotes add / remove / reorder` | "Manage my quotes" (dry-run unless `--execute`) |
| `comments list` / `messages folders` / `messages list` | "Inspect comment/message page shape without bodies" |
| `write-plan books move` / `write-plan notes publicize` | "Static dry-run mutation plans" |
| `request plan` / `request execute` | "Drive any mapped route raw" (reads run live; mutations require three explicit gates) |

## Safety model

```bash
# Reads: live and free
goodreads-cli shelves discover --fixture ./fixtures/shelf-read.html
goodreads-cli api-map search "publicize notes"

# Quote writes: dry-run by default; --execute fires the live Rails-UJS POST
goodreads-cli quotes reorder --quote-id <id> --direction top            # dry-run plan
goodreads-cli quotes reorder --quote-id <id> --direction top --execute  # live

# Notes publicize/hide: gated THREE ways — --execute + exact --approved-book-id + env flag
GOODREADS_ALLOW_NOTES_PUBLICIZE=1 \
GOODREADS_COOKIE="session-id=..." GOODREADS_CSRF_TOKEN="..." \
goodreads-cli notes publicize --book-id <id> --approved-book-id <id> --execute --json

# Generic mapped mutation: dry-run unless all three exact gates are present
GOODREADS_ALLOW_GENERIC_WRITES=1 goodreads-cli request execute \
  --route "PUT /notes/{book_id}/share" \
  --approved-route "PUT /notes/{book_id}/share" \
  --param book_id=<id> --form visible=true --execute
```

Every live mutation prints a `[WRITES TO LIVE GOODREADS]` warning to stderr, and the rule is **verify after every write** — never trust an HTTP 200; reload the notes page and confirm the visible count.

## Use it from an agent (MCP)

```bash
corepack pnpm build
scripts/goodreads-mcp.sh                  # full profile by default
GOODREADS_MCP_PROFILE=core scripts/goodreads-mcp.sh
node scripts/goodreads-doctor.mjs
```

Register the same absolute `scripts/goodreads-mcp.sh` wrapper with Codex, Claude,
and Hermes. It sources `~/.goodreads/auth.sh` at runtime; do not duplicate cookie
or CSRF values into client configuration. `full` preserves all legacy tool
names, while `core` and `notes` cut routine discovery cost by about 71% and 51%
respectively. See [`docs/token-efficiency.md`](./docs/token-efficiency.md).

Every MCP tool inherits the **same** engine, auth, route map, and write gates as
the CLI. The generic executor is marked destructive and requires `execute`, an
exact approved route, and `GOODREADS_ALLOW_GENERIC_WRITES=1` for mutations.

## Example: agent-driven notes publicizing

What it looks like to ask an agent to make a book's Kindle highlights public — discover the route, check counts, plan, then execute behind the gates:

```bash
$ goodreads-cli api-map search notes                       # 1. find the route
$ goodreads-cli notes publicize-plan --book-id 218134959 \  # 2. preflight counts
    --detail-fixture ./fixtures/notes-218134959.html --approved-book-id 218134959 --json
# => { "detail": { "noteCount": 47, "visibleNoteCount": 0, "hiddenNoteCount": 47 },
#      "action": "publicize-notes", "blockers": [] }
$ goodreads-cli notes publicize --book-id 218134959 --dry-run --json   # 3. dry-run shows the gates
$ GOODREADS_ALLOW_NOTES_PUBLICIZE=1 goodreads-cli notes publicize \    # 4. execute
    --book-id 218134959 --approved-book-id 218134959 --execute --json
# 5. reload /notes/{book_slug}/{user_slug} and verify visibleNoteCount === noteCount
```

The agent never emits raw highlight text, never leaks cookies or tokens, and every write is gated even when driven autonomously.

## The map is the point

The real artifact lives in [`api-map/`](./api-map/):

- An **OpenAPI 3.1** spec of the undocumented Goodreads web surface.
- A privacy-safe **AppSync GraphQL operation catalog** with current and historical evidence labels.
- **Per-endpoint Markdown** under [`api-map/markdown/`](./api-map/markdown/).
- A **curl** reference so any of it is reproducible without this CLI.

It covers the read surface (HTML pages, RSS, CSV exports), write endpoints (Rails-UJS forms and current client-source routes), and a non-executable **AppSync GraphQL** catalog for modern book/rating/feed widgets. A 2026-06-08 hardening pass live-tested every read route and fire-tested reversible writes; the 2026-07-14 authenticated CDP pass corrected note methods and expanded account, import/export, recommendation, and settings coverage. See [`docs/write-operations.md`](./docs/write-operations.md).

The consolidated July 2026 improvement audit is in
[`docs/improvement-audit-2026-07-14.md`](./docs/improvement-audit-2026-07-14.md),
with redacted security reproduction evidence in
[`docs/security-audit-2026-07-14.md`](./docs/security-audit-2026-07-14.md).

## Architecture & extending

```
api-map/ ─ the mapped web surface + GraphQL operation catalog (the product)
   │
cli/src/engine.ts ─ THE SHARED ENGINE (every operation, enveloped output)
   ├── cli/src/commands/*  ─ thin commander wrappers
   └── mcp/src/server.ts   ─ thin MCP tool adapters
```

Found an endpoint I missed? Add it to the OpenAPI spec (or GraphQL catalog) and regenerate the endpoint Markdown. Map-only capabilities automatically reach CLI/MCP search through the shared engine. For a dedicated command, wire **one engine function + a `CAPABILITIES` entry** and add matching CLI/MCP adapters; the parity test catches orphans. Full developer runbook: [`AGENTS.md`](./AGENTS.md). Operating guide for agents: [`SKILL.md`](./SKILL.md).

---

<p align="center">
  <a href="https://github.com/zaydiscold"><img alt="GitHub" src="https://img.shields.io/badge/GitHub-zaydiscold-181717?style=for-the-badge&logo=github"></a>
  <a href="https://twitter.com/ColdCooks"><img alt="X / Twitter" src="https://img.shields.io/badge/X-@ColdCooks-000000?style=for-the-badge&logo=x"></a>
  <a href="https://zayd.wtf"><img alt="Website" src="https://img.shields.io/badge/Web-zayd.wtf-FF4D8D?style=for-the-badge"></a>
</p>

---

Built on the trio pattern (CLI + skill + MCP) pioneered by [Matt Van Horn's Printing Press](https://github.com/mvanhorn/cli-printing-press).

<p align="center"><strong>Mapped &amp; built by Zayd Khan // cold</strong> (<a href="https://twitter.com/ColdCooks">@ColdCooks</a> / <a href="https://github.com/zaydiscold">zaydiscold</a> / <a href="https://zayd.wtf">zayd.wtf</a>). MIT © Zayd Khan.</p>

---

> **`*** SYSTEM NOTIFICATION ***`**
>
> Congratulations, Reader. You reached the last page of the README — most dog-ear it and quit.
>
> *Achievement unlocked — "Marginalia."* You now hold a typed, gated control plane for your own
> reading life: every shelf, every quote, every Kindle highlight you annotated at 2am. The System
> notes your `GOODREADS_ALLOW_NOTES_PUBLICIZE` flag is **unset.** Good — highlights stay yours
> until you say otherwise.
>
> *A library is only as private as the reader guarding it. You're the reader. Publicize on purpose.*
>
> **Loot dropped:** one (1) hand-mapped API, 28 MCP tools, and the receipts in `api-map/`.
> *Read deliberately. Ship the complete thing. Return your books on time.* 📚

<!-- Zayd Khan // cold // www.zayd.wtf -->
