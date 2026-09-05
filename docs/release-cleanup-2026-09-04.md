# Goodreads release cleanup

Development evidence for the source repository. Exclude this report from the future public product extraction.

## Scope and source

Prepared a local release checkout from PR #60 at `caea2e7b781966450c3d7e2d1a578b4bf43f0c3a` and integrated current `main` at `cb24e5eb0c2a446c5f19e79db8c650a08ee89fb9`. This preserves both the pending source hardening and the newer annotation-count and Windows MCP-startup fixes. The README conflict keeps the CLI-first presentation; the library conflict keeps the failure-aware account observation logic and the newer request assertion.

The existing GitHub repositories, PRs, visibility, releases, and packages were not changed. PR #61 remains excluded.

## Review and rating verification defect

### Finding

After an accepted review-clear or rating-clear request, failed account readback could return default empty state. Verification interpreted that missing state as a successfully cleared value. Unrelated HTTP 200 HTML could also produce a false confirmation.

### Reproduction and evidence

`cli/test/libraryVerification.test.ts` mocks the write transport to return `requestAccepted: true`. It then supplies either a failed fetch or unrelated HTML to the actual account-state reader. Before the fix, all four negative cases returned `mutationVerified: true` and `outcome: verified`. The expected result is `mutationVerified: false` and `outcome: indeterminate`.

```bash
corepack pnpm --filter @zaydiscold/goodreads-cli exec vitest run test/libraryVerification.test.ts
```

The test never sends a live mutation. It also exercises a populated review with exact and mismatched readback hashes, verifies that output omits review text, and confirms legitimate empty-form and zero-rating readbacks.

### Fix and significance

Authenticated observation now requires the review edit field to be present. Library writes require successful authenticated evidence before declaring verification. Clearing a rating requires an observed zero, not a null value. A network failure, unrecognized page, or public RSS fallback cannot independently confirm a write to the authenticated account.

This keeps agents from claiming a review or rating changed when the result remains unknown.

## Runtime and package inspection

Public search was exercised through the built CLI:

```bash
node cli/dist/index.js search books --query "Parable of the Sower Octavia Butler" --json
```

The response contained the expected book and author among 18 candidates. This verifies search, not all book-discovery commands or account writes.

Package inspection:

```bash
cd cli
npm pack --dry-run --json --ignore-scripts
```

The inspected build contained 200 files, including 122 under `dist/api-map/` (166,805 bytes of the 374,633-byte unpacked package). The map includes a browser-route capture, curl reference, GraphQL catalog, and per-endpoint Markdown. These counts describe that inspection, not a permanent contract.

The build still copies the full map. Deleting it would break route loading. Public extraction must first give shipped features their required runtime route definitions and remove research-only distribution surfaces. See `public-repo-migration.md` and `api-map-separation.md` for the existing boundary.

## Release boundary

Final local `corepack pnpm check` passed: 2 runtime tests, 102 CLI tests, and 14 MCP tests, plus dependency audit, the repository scanner, lint, formatting, type checking, integrity, and production builds. This was run on Node 22; the Node 20 CI matrix was not executed locally. A prior run was interrupted by a long machine pause and timed out; the fresh complete rerun passed.

The built public book lookup also returned the expected title and author for `book show 52397-parable-of-the-sower --json`.

An authenticated `library show` read using the existing local auth file returned `authenticatedSuccess: true`, `stateObserved: true`, and no warnings. Only evidence flags were recorded; account content and credentials were not retained. The built MCP server initialized and listed 28 tools in its default read-only profile. The doctor reported no runtime errors and fresh builds; its Git warnings reflect the local, unpushed cleanup branch.

The source cleanup is local. This is not a published package or a completed clean-history public extraction. Fresh authenticated mutation acceptance still requires an approved target, exact action/content, independent state readback, and rollback where applicable. No review was posted during this cleanup.

The repository-specific secret scanner is a focused pattern check of selected tracked files. It is not a full-history secret audit or proof that all research is suitable for public redistribution.
