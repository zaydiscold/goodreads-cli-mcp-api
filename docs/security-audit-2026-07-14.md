# Security and Runtime Audit — 2026-07-14

This document records the material auth/session/runtime findings from the July
2026 CLI + MCP audit. Secret values and private response bodies are deliberately
omitted.

## Findings

### Arbitrary-origin credential forwarding

**What was found.** The generic MCP executor accepted a caller-controlled
`baseUrl`. The live HTTP helper then attached `GOODREADS_COOKIE` and
`GOODREADS_CSRF_TOKEN` whenever those variables existed. A tool caller could
therefore direct a mapped request to a non-Goodreads origin and receive both
credentials.

**How it was reproduced.** A mocked `fetch` replaced the network. The request
used a mapped notes mutation with `baseUrl=https://attacker.invalid`; the
captured request contained the cookie header, CSRF header, and form CSRF field.
No real secret or external request was used.

**Why it matters.** MCP tools are model-controlled. Agent-supplied URLs are not
a trust boundary, and browser session material grants access to the user's
Goodreads account.

**Remediation.** The agent-facing executor no longer exposes `baseUrl`.
Credentialed traffic is pinned to the exact `https://www.goodreads.com` origin,
credentialed redirects are handled manually, and cross-origin redirects are
rejected. Unauthenticated custom-origin reads never receive credentials.

**Regression proof.** `cli/test/live.test.ts` asserts that an attacker origin
receives no request and that public custom-origin reads contain neither auth
header.

### Generic writes were live by default

**What was found.** `request execute` sent mutating routes unless callers
remembered `--dry-run`. The MCP equivalent defaulted `dryRun` to false. This
contradicted the repository invariant that writes produce plans by default.

**How it was found.** The CLI option defaults, MCP schema defaults, shared-engine
branch, and `buildLiveRequestPlan()` were traced together. A mapped mutation
without a dry-run flag produced `execute: true`.

**Why it matters.** The generic executor reaches every mapped mutation,
including mutating GET routes. A mistaken agent call could change account state
without an explicit write decision.

**Remediation.** Reads remain live. Mutations now default to dry-run and require
all of: `execute=true`/`--execute`, an exact `approvedRoute`, and
`GOODREADS_ALLOW_GENERIC_WRITES=1`. The generic MCP tool is conservatively
advertised as destructive.

### HTTP success was not mutation verification

**What was found.** Any 2xx response was treated as a successful submission.
The API map already records a quote-create case where Goodreads returned a 202
anti-bot page without creating the quote.

**How it was reproduced.** A mocked 202 HTML response containing a robot check
was passed through the live executor. The old path returned success metadata.

**Why it matters.** An HTTP acceptance code, login page, or challenge page does
not prove account state changed. Claiming success from status alone can make
automation silently skip required work.

**Remediation.** Results now separate `requestAccepted` from the always-explicit
`mutationVerified: false`, classify common anti-bot/login responses, expose
redirect state, and keep the existing reload-verification requirement.

### Installed MCP path was stale

**What was found.** The canonical built artifact existed at:

```text
/Users/zaydk/Desktop/CLIs/goodreads-cli/mcp/dist/server.js
```

Hermes was configured for the deleted path:

```text
/Users/zaydk/Desktop/goodreads-cli/mcp/dist/server.js
```

**Raw evidence.** The Hermes stderr log contained 7,504 matching
`MODULE_NOT_FOUND` failures from June 15 through July 14. The relevant config
was `~/.hermes/config.yaml` under the `goodreads` MCP entry. Secret fields were
not read or recorded.

**Why it matters.** A repository can build successfully while every real agent
still has a broken installation. Source parity and runtime registration are
separate states.

**Remediation.** Registrations use the tracked bootstrap/wrapper rather than an
ignored `dist` file. The wrapper loads the chmod-600 auth file at runtime so
secrets are not copied into each client config. The doctor command checks the
artifact and performs real MCP discovery.

### Fresh clones do not contain `server.js`

**What was found.** `mcp/src/server.ts` is tracked; `mcp/dist/server.js` is a
generated, ignored artifact. A fresh clone legitimately has no JavaScript
server until the CLI and MCP packages are built in order.

**Why it matters.** Pointing clients directly at the ignored artifact creates a
fragile hidden prerequisite and produces the misleading impression that the
repository has no server.

**Remediation.** The tracked launcher checks source/build freshness, runs the
ordered root build when needed without polluting MCP stdout, and then starts the
generated server.

## Reproduction and verification

All commands below are safe and redact auth values:

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm audit --audit-level moderate
node scripts/goodreads-doctor.mjs
GOODREADS_MCP_PROFILE=core scripts/goodreads-mcp.sh
```

For protocol verification, use the MCP integration tests rather than importing
`mcp/src/server.ts` into a normal process; importing the server intentionally
opens stdio transport.

## Remaining operational boundary

Goodreads is an undocumented web surface. Even a request classified as accepted
must be verified by re-reading the relevant account page. Do not log cookies,
CSRF tokens, private RSS keys, raw highlights, message bodies, or private URLs.
