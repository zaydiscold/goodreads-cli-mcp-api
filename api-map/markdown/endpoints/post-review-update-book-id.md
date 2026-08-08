# POST /review/update/{book_id}

Normal Rails form submission from `/review/edit/{book_id}`. Live-proven with a
temporary review followed by an empty review to restore baseline. Required
controls include `utf8`, `authenticity_token`, `review[review]`, spoiler/sell
flags, `next=Post`, and `source=form`.

Do not send `X-Requested-With`: the successful contract returns a trusted 302
to `/review/show/{review_id}`. Verify review length and hash by reloading the
authenticated edit page.

Mutation: yes
Risk: write-mutate

Summary: Inline review/date/notes field update for one book.

Tags: shelves

Parameters:

- book_id (path, required)

Source: api-map/openapi/undocumented/goodreads-web.yaml
