# Security Policy

## Sensitive data

Never commit or paste into issues, pull requests, logs, or public evidence:

- `GOODREADS_COOKIE` or its individual cookie values
- `GOODREADS_CSRF_TOKEN` or Rails authenticity tokens
- private Goodreads RSS keys
- authenticated raw HTML captures
- Kindle highlight text, review text, comment bodies, or message bodies
- annotation pair IDs or note persistence endpoints
- private account URLs or user-specific action links

Use sanitized structural fixtures and bounded metadata receipts instead.

## Supported release

Security fixes target the current default branch. This project drives unofficial Goodreads web surfaces, so a working route is not a stability guarantee.

## Reporting

Report suspected vulnerabilities privately to the repository owner before opening a public issue. Include the affected CLI command or MCP tool, a redacted reproduction, and the expected trust boundary. Do not include credentials, response bodies, owned reading content, or account identifiers.

## Runtime boundaries

- Credentialed traffic is restricted to exact HTTPS `www.goodreads.com`.
- Redirects carrying credentials remain on the same trusted origin.
- Goodreads path parameters are encoded as one segment and dot segments are rejected.
- Response and fixture payloads are bounded.
- MCP fixture access is restricted to `GOODREADS_MCP_FIXTURE_ROOT` unless an explicit unsafe compatibility override is enabled.
- Private annotation IDs require `GOODREADS_MCP_ALLOW_PRIVATE_IDS=1`.
- Account mutations default to dry-run and require exact approvals.
- The default MCP profile is read-only.
- Failed response bodies are omitted from errors.
