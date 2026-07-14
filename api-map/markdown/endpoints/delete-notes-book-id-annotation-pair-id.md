# DELETE /notes/{book_id}/{annotation_pair_id}

Mutation: yes
Risk: write-destructive

Summary: Delete one entire Kindle annotation/highlight.

Tags: notes

Parameters:
- book_id (path, required)
- annotation_pair_id (path, required)
- reading_note_id (query, required)

Source: api-map/openapi/undocumented/goodreads-web.yaml
