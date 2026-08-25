## User outcome

<!-- What concrete reader or maintainer problem does this solve? -->

## Changes

<!-- Summarize the smallest useful set of changes. -->

## Public surface

- [ ] CLI help, command names, output, or package exports changed.
- [ ] MCP exposure changed because the capability is useful to agents.
- [ ] No public interface changed.

<!-- Explain intentional breaking changes. Do not preserve internal or unreleased surfaces solely to keep a count stable. -->

## Safety and privacy

- [ ] Fixtures and examples use synthetic or privacy-safe data.
- [ ] No credentials, private text, private URLs, account IDs, local paths, or raw authenticated captures are included.
- [ ] Writes remain dry-run by default.
- [ ] Live writes require explicit approval and define an independent readback where possible.
- [ ] HTTP acceptance is not reported as account-state verification.
- [ ] Credentialed traffic remains restricted to the trusted Goodreads origin.

## Tests

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm check
```

<!-- Add focused commands or manual checks below. -->

## Live account activity

<!-- State `none`, or describe the approved reversible action and sanitized readback. Never include private values. -->
