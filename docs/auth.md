# Auth

Goodreads uses browser cookie sessions and can redirect through Amazon SSO.

Current implementation rules:

- Public RSS and public book pages do not require cookies.
- Full bookshelf export should use an authenticated browser/session fixture or caller-provided `GOODREADS_COOKIE`.
- Do not commit cookies, CSRF tokens, private RSS keys, or raw session captures.
- If Amazon SSO returns `403` or redirects to login, retries will not fix it; re-authenticate in the browser.
- Generic mutations require `GOODREADS_ALLOW_GENERIC_WRITES=1`, explicit execution, and exact route approval.
- Notes/highlights publicize workflow execution additionally requires `GOODREADS_ALLOW_NOTES_PUBLICIZE=1`, `--execute`, and the exact approved book id.
- `GOODREADS_COOKIE` is required for authenticated live mutations.
- `GOODREADS_CSRF_TOKEN` or a current form `authenticity_token` is required for POST/PUT/PATCH/DELETE Rails-form mutations.

Write routes use Rails-style `authenticity_token` form fields. Credentials are
sent only to the exact `https://www.goodreads.com` origin; credentialed redirects
are not followed across origins. Mutating routes print
`[WRITES TO LIVE GOODREADS]` to stderr before execution. Workflow commands can
be stricter than the generic executor.
