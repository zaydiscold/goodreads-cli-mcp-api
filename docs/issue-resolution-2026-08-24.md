# Launch issue resolution ledger

Date: 2026-08-24 (America/Los_Angeles)
Canonical pull request: #59

This ledger prevents the pre-launch issue tracker from becoming a permanent collection of duplicate audits and speculative architecture. “Not planned” does not mean the underlying idea is impossible. It means the issue is not required for this launch, is superseded by a narrower mechanism, or would add compatibility risk without a demonstrated user problem.

## Completed by the canonical launch PR

| Issue | Resolution |
|---|---|
| #29 | MCP fixture paths are rooted, canonicalized with `realpath`, and protected against traversal and symlink escapes. Relative paths resolve inside the configured root. |
| #30 | MCP shelf and quote mutations require the exact approved target values or canonical payload hash before execution. |
| #32 | Dynamic Goodreads path values use one segment encoder, reject direct and encoded dot segments, and cannot change the trusted origin or route prefix. |
| #33 | Library reads no longer use a personal account fallback and now report source success, signed-out state, warnings, and evidence-derived confidence. |
| #34 | Status and review writes require exact approvals; review verification uses canonical SHA-256 equality rather than matching length. |
| #35 | CSRF selection is request-local and failed response bodies are omitted from errors. |
| #39 | An explicitly forced dry run returns a plan without requiring live-only mutation authorization. |
| #40 | Recent-reading and notes plans validate shared limits, distinguish explicit missing fixtures, derive verification metadata only from the requested book identity, and report truthful route confidence. |
| #49 | A read-only MCP profile is the safe default while `full`, `core`, and `notes` remain available. |
| #53 | Critical-file integrity uses semantic sentinels rather than line-count floors. Human contribution, security, PR, and issue templates are present. |
| #54 | CI runs a redacted repository-specific scan over production code, documentation, scripts, fixtures, proofs, and captures. Findings omit the matched value. |

## Partially implemented, then deliberately closed for launch

| Issue | Shipped portion | Deliberate boundary |
|---|---|---|
| #42 | Every tool is registered before stdio connect and MCP responses include `structuredContent` alongside compatible text JSON. | Per-tool static `outputSchema` declarations are not added until the heterogeneous envelopes have one stable versioned schema. Advertising incomplete schemas would be worse than omitting them. |
| #45 | Remote Goodreads responses are capped, failed bodies are redacted, and arbitrary MCP fixture access is sandboxed. | A universal recursive depth/node budget and configurable limit for every direct local CLI parser is not a launch blocker for user-owned files. |
| #48 | CLI/MCP version metadata is aligned at 1.1.0 and the package remains private. | Publication and packed-tarball release are intentionally blocked until the public/private route-catalog separation is complete and the tarball is manually inspected. |
| #52 | Broken `includeReviewId` behavior is implemented and misleading write approvals are corrected. | Legacy options, aliases, and advanced route commands remain for compatibility. Cleanup must not remove public function. |

## Duplicate or superseded

| Issue | Resolution |
|---|---|
| #41 | Duplicate of #38. Both describe generating CLI/MCP contracts from one larger manifest. |
| #38 | Superseded by stronger parity tests, one shared engine, runtime profile inventories, and explicit compatibility rules. A full schema generator is not required for launch. |

## Not planned for this launch

| Issue | Reason |
|---|---|
| #43 | The route catalog is being separated from the public product. Expanding public OpenAPI generation and extension validation before that separation would optimize the wrong surface. |
| #44 | A repository-wide envelope migration would be a breaking contract. Sensitive writes now report explicit planned/submitted/verified outcomes where correctness matters. |
| #46 | A process-wide retry scheduler and configurable rate governor are not justified by current single-user local usage. Mutations remain non-retried and live reads are bounded. |
| #47 | Additional live pagination is a product feature, not a correctness blocker. Existing bounded reads disclose incompleteness rather than claiming completeness. |
| #50 | Catalog caching is a micro-optimization without measured user impact. It should follow profiling, not precede launch. |
| #51 | A full historical sanitized-fixture corpus and parser-diagnostic schema is worthwhile future test infrastructure, but current regressions already cover the concrete parser failures found in review. |
| #55 | Splitting the shared engine into many domains immediately before launch creates compatibility and merge risk. The stable engine/public compatibility surface is retained. |
| #56 | Additional doctor modes and a Windows launcher matrix are post-launch operational improvements. Current launchers and Node 20/22 package behavior remain covered by existing checks. |

## Closure rule

Issues in “completed” may be closed as `completed` only after the final #59 CI run passes on Node 20 and Node 22.

Issues in “duplicate or superseded” should be closed as `duplicate` or `not planned` with a pointer to this ledger.

Issues in “not planned” should be closed as `not planned`, not left open as implied launch commitments. A future issue may be opened only when there is a concrete user outcome, measured failure, or new evidence that changes the tradeoff.
