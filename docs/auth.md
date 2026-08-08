# Auth

Goodreads uses **one** browser cookie session for every authenticated read and
write. There is no separate login per feature. Notes publicize, shelf add/remove,
quotes, and generic route execute all share:

| Env | Role |
|---|---|
| `GOODREADS_COOKIE` | Durable session. Extract once from a logged-in browser. |
| `GOODREADS_CSRF_TOKEN` | Rails CSRF. **Stale values 404 writes.** The CLI refreshes this automatically from the cookie before live mutations. |
| `GOODREADS_ALLOW_NOTES_PUBLICIZE=1` | Extra gate for notes publicize/hide |
| `GOODREADS_ALLOW_GENERIC_WRITES=1` | Extra gate for raw `request execute` mutations |

## One session, all functions

```text
Chrome (logged in) ──cookie──▶ ~/.goodreads/auth.sh
                                      │
                                      ▼
                         GOODREADS_COOKIE  (durable)
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
     notes publicize          shelves add/remove          quotes / request
     PUT /notes/.../share     POST /shelf/add_to_shelf    ...
              │                       │                       │
              └──────── ensureFreshCsrf() from same cookie ───┘
                        (meta csrf-token → authenticity_token)
```

Current implementation rules:

- Public RSS and public book pages do not require cookies.
- Full bookshelf export should use an authenticated browser/session fixture or caller-provided `GOODREADS_COOKIE`.
- Do not commit cookies, CSRF tokens, private RSS keys, or raw session captures.
- If Amazon SSO returns `403` or redirects to login, retries will not fix it; re-authenticate in the browser and re-extract the cookie.
- Generic mutations require `GOODREADS_ALLOW_GENERIC_WRITES=1`, explicit execution, and exact route approval.
- Notes/highlights publicize workflow execution additionally requires `GOODREADS_ALLOW_NOTES_PUBLICIZE=1`, `--execute`, and the exact approved book id.
- Shelf add/remove requires cookie + execute (CSRF auto-refreshed); no extra env gate beyond dry-run default.
- `GOODREADS_COOKIE` is required for authenticated live mutations.
- Live Rails mutations send `Referer`, `Origin`, and `X-Requested-With`. Without them Goodreads returns opaque HTTP 404s (same lesson as `publicize.py`).
- Before every live Rails mutation the client GETs `https://www.goodreads.com/` with the cookie and extracts a fresh `csrf-token` unless:
  - the caller already supplied form `authenticity_token`, or
  - `GOODREADS_SKIP_CSRF_REFRESH=1` (tests / offline only).

Write routes use Rails-style `authenticity_token` form fields. Credentials are
sent only to the exact `https://www.goodreads.com` origin; credentialed redirects
are not followed across origins. Mutating routes print
`[WRITES TO LIVE GOODREADS]` to stderr before execution. Workflow commands can
be stricter than the generic executor.

## Extract cookie (Windows / mothership)

```bash
# Prefer CDP from a logged-in Chrome tab on goodreads.com, then:
# ~/.goodreads/auth.sh
export GOODREADS_COOKIE='...'   # full Cookie header string
export GOODREADS_CSRF_TOKEN='...'  # optional bootstrap; CLI refreshes on write
export GOODREADS_ALLOW_NOTES_PUBLICIZE=1
chmod 600 ~/.goodreads/auth.sh
```

**Cookie quoting:** Goodreads cookies embed double-quotes. Prefer single-quoted
shell exports (`export GOODREADS_COOKIE='...'`). Double-quote wrapping breaks
silently.

## Doctor signals

| Symptom | Meaning | Fix |
|---|---|---|
| `currentUser: null` / Sign In wall on authenticated GET | Cookie dead | Re-extract from browser |
| HTTP 404 + empty / tiny body on POST | Often missing Referer/Origin (fixed in client) or wrong book_id | Client sends headers; check body text |
| HTTP 404 + `Sorry, we couldn't find that book.` | Wrong numeric `book_id` | Resolve id from editions page / book page |
| CSRF refresh throws authentication | Cookie not signed in | Re-login + re-extract cookie |

## Cookie jar rules (2026-08)

- **Full jar for writes.** Keep Amazon SSO cookies on `.goodreads.com` (`at-main`, `session-token`, `ubid-main`, …) plus `_session_id2` / `jwt_token` / `aws-waf-token`. Stripping SSO cookies makes `POST /shelf/add_to_shelf` return 403/`/user/new`.
- **Public search is separate.** `/search` can 302-loop when the full SSO jar is sent. `searchBooks` uses `fetchPublicText` (SSO cookies stripped) or anonymous GET.
- **User-Agent.** Goodreads `Vary: User-Agent`. Prefer a real Chrome UA; the old `goodreads-cli/1.0.0` token is easier to WAF-challenge after burst traffic.
- **Extract:** CDP `Network.getAllCookies` while on a logged-in Goodreads tab (notes or account settings). Write `~/.goodreads/auth.sh` with `shlex.quote` single quotes (values embed `"`).
