# MCP Token Efficiency

The Goodreads MCP keeps the full CLI capability set available without forcing
every agent to pay for all of it in routine discovery.

## Baseline measured on 2026-07-14

The original full `tools/list` response advertised 28 tools:

- 16,861 compact JSON bytes
- 3,981 `o200k_base` tokens
- 6,712 bytes of input schemas
- 3,111 bytes of descriptions
- 2,478 bytes of annotations

Pretty-printed JSON also inflated representative tool results by 22–38%. The
default 80-route map response cost about 8,863 tokens; the full browser-route
response cost about 1,766 tokens.

## Profiles

Set `GOODREADS_MCP_PROFILE` before starting the server:

- `full` — all legacy tools and exact names for compatibility.
- `core` — eight high-frequency discovery/books/notes tools. Current cost:
  4,830 bytes / 1,164 tokens: **70.98% fewer tokens**, **71.64% fewer bytes**,
  and **71.43% fewer visible tools** than full.
- `notes` — thirteen notes/annotations/recent-reading tools. Baseline cost:
  8,302 bytes / 1,956 tokens: **51.23% fewer tokens** and **51.26% fewer
  bytes** than full.

The post-audit `full` profile is 17,034 bytes / 4,011 `o200k_base` tokens. These
figures are measured from the actual MCP `tools/list` tool array, not estimated
from source descriptions. The authenticated API-map expansion added no tools;
web and AppSync discoveries use the existing route-search tool.

Profiles hide registrations; they do not create divergent implementations.
Every visible tool still calls the same shared engine used by the CLI.

## Result policy

- MCP JSON text is compact by default. Set `GOODREADS_MCP_OUTPUT=pretty` only
  for protocol debugging.
- The CLI remains pretty-printed for humans.
- Route listing defaults to 20 entries rather than 80.
- Browser-route listing defaults to summary mode.
- Large exports should be bounded or moved behind resource links instead of
  being inserted into model context unprompted.

## Guardrails

The MCP integration tests enforce profile membership, discovery byte ceilings,
compact results, annotations, and dry-run mutation behavior. When adding a
tool, measure `tools/list` before expanding the default profile.
