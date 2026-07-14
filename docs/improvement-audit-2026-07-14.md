# Goodreads CLI/MCP improvement audit — 2026-07-14

## Outcome

The canonical repository, Mac checkout, and Windows checkout were identified and reconciled. The API map, CLI, MCP server, launch path, agent registrations, write boundaries, test suite, dependency posture, and observed local usage were audited as one system.

This pass keeps the full 28-tool MCP surface available for compatibility while installing the smaller 8-tool `core` profile for everyday agents. It also fixes the foundational `server.js` concern with a build-aware launcher: a fresh checkout may legitimately lack ignored build output, but the launcher now creates or refreshes `mcp/dist/server.js` before starting the protocol server.

## Pairing evidence

| Copy | Canonical location | State found | Reconciliation |
| --- | --- | --- | --- |
| GitHub | `https://github.com/zaydiscold/goodreads-cli-mcp-api` | `main` at `69bcc4c` | Treated as canonical remote |
| Mac | `/Users/zaydk/Desktop/CLIs/goodreads-cli` | One commit behind initially | Fast-forwarded before changes |
| Windows | `C:\Users\ZaydK\Desktop\clis and apis\goodreads-cli` | Same base commit; old redirecting remote URL | Remote changed to canonical URL |

The path previously checked as `C:\Users\ZaydK\Desktop\goodreads-cli` is not the canonical Windows checkout. The canonical checkout did contain `mcp\dist\server.js`; the durable problem was that agents depended directly on an ignored build artifact and could point at stale paths.

## Perspectives used

### API and CLI correctness

- Exercised public book and RSS reads against Goodreads.
- Corrected ignored `books list --source` behavior, fixture-backed message parsing, mutually exclusive book inputs, alternate shelf export filenames, and shelf-name regex escaping.
- Made the package root import side-effect free through `dist/api.js`.
- Added the three documented notes routes that were absent from the OpenAPI map, clearly separating live-verified behavior from inferred, disabled behavior.
- Redacted annotation identifiers and persistence endpoints by default.
- Repaired the Windows/WSL daily sync command and made its output atomic so a failed run cannot publish a zero-byte data file.

### MCP and token efficiency

- Added `full`, `core`, and `notes` tool profiles while retaining `full` as the compatibility default.
- Installed `core` for Codex, Claude Code, and Hermes.
- Made result JSON compact by default, bounded route results to 20, and summarized browser-route output by default.
- Corrected standard MCP tool annotations and added real stdio discovery/call tests.
- Kept generic execution out of the smaller profiles; full-profile generic mutations now require three independent approvals.

Measured tool-discovery inventory:

| Profile | Tools | JSON bytes | Approx. tokens | Change from full |
| --- | ---: | ---: | ---: | ---: |
| `full` | 28 | 17,042 | 4,017 | baseline |
| `core` | 8 | 4,828 | 1,207 | about 70% smaller |
| `notes` | 13 | 8,310 | 1,957 | about 51% smaller |

See [token-efficiency.md](token-efficiency.md) for methodology and result-payload measurements.

### Runtime and actual agent usage

- Found a stale Hermes registration targeting `/Users/zaydk/Desktop/goodreads-cli/mcp/dist/server.js`; logs contained 7,504 `MODULE_NOT_FOUND` failures for that path.
- Replaced direct `dist/server.js` registrations with `scripts/goodreads-mcp.sh`, which securely loads runtime auth, checks build freshness, serializes rebuilds, and preserves protocol-clean stdout.
- Verified Codex and Claude registrations and a Hermes connection with all eight core tools discovered.
- Installed a stable `~/.local/bin/goodreads-cli` symlink and added `scripts/goodreads-doctor.mjs` for repeatable repo, build, auth, CLI, MCP, and Git checks.
- Recovered real Windows publicizing evidence from the existing workflow: 33 annotated books inspected, one book needing publicizing, 12 notes submitted, 32 books already visible, and zero failures. This was useful behavioral evidence but came from a separate helper rather than recorded MCP calls.
- Found the Windows recent-reading sync’s zero-byte output and traced it to an invalid command-group invocation.

No reliable historical per-tool call ledger existed for the current MCP. The new stdio tests and doctor establish trustworthy measurements going forward without adding telemetry or retaining private reading content.

## Security findings

The highest-severity issue was credential exfiltration: an arbitrary `baseUrl` could receive the Goodreads cookie and CSRF token. Credentialed requests are now restricted to the exact `https://www.goodreads.com` origin, auth headers are attached only when required, redirects are handled manually for credentialed calls, and cross-origin redirects are rejected.

Generic mutations now require all of:

1. explicit execution;
2. an exact approved route identifier;
3. `GOODREADS_ALLOW_GENERIC_WRITES=1`.

HTTP success alone is no longer described as mutation success. Results distinguish request acceptance, authentication/anti-bot challenges, redirects, and unverified mutation state. Full reproduction steps and redacted evidence are in [security-audit-2026-07-14.md](security-audit-2026-07-14.md).

## Verification performed

- Workspace build and TypeScript checks.
- 32 CLI tests and 8 MCP stdio tests.
- ESLint and Prettier checks across CLI/MCP source and tests.
- Shell and Node syntax checks for launch, doctor, and sync scripts.
- Package inspection: CLI tarball contains `dist/index.js` and `dist/api.js`; MCP tarball contains `dist/server.js` and `dist/profile.js`.
- Dependency audit at moderate-or-higher severity: zero findings; one low-severity transitive advisory remains.
- Live Goodreads public RSS shelf read and public book read.
- Real MCP connection/discovery in Codex, Claude Code, and Hermes.
- Doctor verification of mode-`600` auth storage without printing credential values.

## Residual constraints

- Goodreads web routes are unofficial and can change without notice; inferred routes remain disabled until captured and approved.
- Mutations report `mutationVerified: false` until a route-specific read-after-write check proves state.
- Historical usage counts are incomplete because prior MCP calls were not centrally recorded. This project intentionally does not add invasive telemetry.
- One low-severity dependency advisory remains below the enforced audit threshold.
