# POST /review/rate/{book_id}

Sets or clears a signed-in user's star rating. Live My Books markup supplies the
book-specific URL; Goodreads' shipped JavaScript submits `format=json` and
`rating=0..5`. The CLI also preserves the observed `redirect_edit=true`,
`shelf=all`, and `stars_click=true` query parameters.

Mutation; dry-run by default. Requires the full authenticated cookie, fresh
Rails CSRF, exact book approval, and independent `/review/edit/{book_id}`
readback.
