# Changelog

## 1.0.0 — 2026-07-14

First stable release of the paired Goodreads API map, CLI, and MCP server.

### Agent efficiency

- Added `full`, `core`, and `notes` MCP profiles over one shared engine.
- Reduced core `tools/list` discovery from 4,011 to 1,164 `o200k_base`
  tokens: **70.98% fewer tokens**.
- Reduced core discovery JSON from 17,034 to 4,830 bytes: **71.64% fewer
  bytes**.
- Reduced routine visible tools from 28 to 8: **71.43% fewer tools**.
- Kept compact MCP output, bounded route results, and summarized browser-route
  output as defaults.

### API, CLI, and MCP

- Expanded the authenticated web map to 107 paths and 114 HTTP operations.
- Added a 12-operation AppSync catalog with non-executable mutation metadata.
- Corrected individual Kindle annotation visibility, spoiler, deletion, and
  note-text methods from current Goodreads client source.
- Kept CLI and MCP behavior paired through the shared engine and parity tests.

### Safety and runtime

- Restricted credentials to the exact Goodreads origin and rejected
  credentialed cross-origin redirects.
- Prevented CSRF form-field injection into custom-origin requests.
- Kept mapped writes dry-run by default with route-specific approval gates.
- Added build-aware macOS/Linux and Windows launchers so generated
  `mcp/dist/server.js` is rebuilt when missing or stale.

### Verification

- 35 CLI tests and 9 real MCP stdio tests pass on macOS, Windows, and GitHub CI.
- Codex, Claude Code, and Hermes use the eight-tool core profile on both paired
  machines.
