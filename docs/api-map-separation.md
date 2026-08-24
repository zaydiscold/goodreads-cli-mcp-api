# Route-catalog separation

## Decision

The public product is **Goodreads CLI**. The optional MCP adapter is a second interface. Detailed endpoint discovery, captures, and evidence should live in a private research repository.

This is not a cosmetic file move. The current CLI is coupled to the repository's `api-map/` tree at build time and runtime:

- the CLI build copies the entire tree into `cli/dist/api-map`;
- the package includes `dist`;
- route loading locates and parses specific YAML files under `api-map/`.

Deleting or moving `api-map/` before replacing that contract would break the CLI. Deleting it from the current branch would also not make previously public Git history private.

## Target layout

### Private repository: `goodreads-web-research`

Keep material here when it is useful for discovery but unnecessary for public runtime behavior:

- raw or lightly sanitized browser captures;
- authenticated HTML and response samples;
- detailed endpoint evidence and confidence chronology;
- curl reproductions and request-shape experiments;
- private account identifiers, route receipts, and rollback notes;
- source snapshots used to investigate AppSync or Rails behavior;
- failed hypotheses and exploratory notes.

No secret belongs in Git, even in a private repository. Cookies, CSRF tokens, private RSS keys, and raw personal reading content remain local-only.

### Public repository: `goodreads-cli`

Keep only what users need to run, audit, test, and extend the product:

- CLI source and command documentation;
- shared engine and parsers;
- optional MCP adapter;
- privacy-safe fixtures;
- tests, safety gates, and verification logic;
- one generated, sanitized runtime route manifest;
- user-facing architecture and contribution documentation.

## Sanitized runtime manifest

The private research repository should export a deterministic manifest with only the fields required by the public engine.

Suggested top-level shape:

```json
{
  "schemaVersion": 1,
  "sourceRevision": "<private-research-commit>",
  "generatedAt": "<iso-8601>",
  "routes": []
}
```

Suggested route fields:

```json
{
  "id": "post_shelf_add_to_shelf",
  "method": "POST",
  "path": "/shelf/add_to_shelf",
  "tags": ["shelves"],
  "summary": "Add a book to a shelf",
  "parameters": [
    {
      "name": "book_id",
      "in": "form",
      "required": true
    }
  ],
  "mutatesAccount": true,
  "requiresApproval": true,
  "transport": "goodreads-web",
  "executable": true
}
```

The public export must exclude:

- headers, cookies, tokens, and captured values;
- raw request or response bodies;
- private IDs and account-specific URLs;
- local file paths and capture timestamps that identify a session;
- detailed source snippets or discovery notes;
- browser-route inventories that are not required by a user-facing command;
- evidence that cannot be published safely.

## Cutover sequence

1. Freeze route-research changes long enough to make one consistent migration.
2. Create the private research repository and copy the full research corpus into it.
3. Add a deterministic exporter in the private repository.
4. Review the exported manifest as if it were untrusted input.
5. Commit the sanitized manifest to the public CLI repository.
6. Refactor `cli/src/lib.ts` to read the manifest instead of locating private-source YAML.
7. Replace `copy-api-map.mjs` with a script that copies only the sanitized manifest.
8. Keep `api-map` and raw `request` commands advanced, or remove them after a deprecation window if they no longer serve CLI users.
9. Add tests that reject unexpected manifest fields and secrets.
10. Run `pnpm pack --dry-run` and inspect every packaged path.
11. Initialize a new, clean-history public repository named `goodreads-cli` from the sanitized tree.
12. Make the old repository private or archive it after links, issues, and release notes are migrated.
13. Update package metadata, badges, documentation links, GitHub topics, and the social preview.
14. Remove `"private": true` from `cli/package.json` only after the package-content check passes.

A clean public repository is preferable to history rewriting here. Rewriting is easy to get wrong, forks and caches may retain old objects, and deletion does not turn previously public material into a secret.

## Required checks

The public repository should fail CI when any of these checks fail:

- route manifest schema validation;
- deterministic export with a recorded source revision;
- no unknown route fields;
- no cookies, authorization headers, authenticity tokens, or private RSS keys;
- no raw authenticated HTML or browser-capture archives;
- no absolute local paths;
- package contents contain only intended runtime and documentation files;
- CLI and MCP parity remains enforced;
- writes still default to dry-run and exact approvals.

## Temporary state

Until the split is complete:

- source installation remains the supported path;
- `cli/package.json` stays private to block accidental publication;
- public messaging should describe the CLI outcomes, not advertise the detailed route map;
- contributors should submit redacted capability descriptions and tests, not raw captures.

This document can be shortened or removed once the clean public repository and private research pipeline are established.
