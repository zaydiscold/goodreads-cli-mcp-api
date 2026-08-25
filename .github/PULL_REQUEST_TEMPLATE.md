## User outcome

<!-- What concrete reader or maintainer problem does this solve? -->

## Surface and compatibility

- [ ] Existing CLI commands remain available.
- [ ] Existing package exports remain available.
- [ ] Existing MCP tool names and profiles remain available.
- [ ] CLI and MCP both call the shared engine where the capability is shared.

## Evidence

- Evidence tier: `mapped | unit | live-read | accepted-write | verified-write | rollback-verified`
- Fixtures or proof are sanitized and contain no private account content.
- No claim is stronger than the evidence produced.

## Safety and privacy

- [ ] Reads are bounded and classify authentication or challenge failures.
- [ ] Writes default to a dry run.
- [ ] Live writes require exact approved values.
- [ ] HTTP acceptance is not reported as account-state verification.
- [ ] Cookies, CSRF tokens, private URLs, highlights, comments, reviews, and messages are not logged.
- [ ] `pnpm secret:scan` passes.

## Verification

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm audit:security
corepack pnpm secret:scan
corepack pnpm lint
corepack pnpm format:check
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## Live mutation statement

<!-- State `none`, or describe the approved reversible write and independent readback without including private values. -->
