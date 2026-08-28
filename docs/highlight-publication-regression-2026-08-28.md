# Goodreads highlight publication regression — 2026-08-28

## Summary

The daily Goodreads watchdog stopped performing the proven idempotent publication sweep before it compared annotation state. As a result, Goodreads' incomplete pre-write detail counts were treated as authoritative and the job skipped the exact write that causes newly imported/private highlights to become visible.

The regression left highlights unpublished in two books:

- **He Who Fights with Monsters 2:** 2 visible → 16 visible (**+14 recovered**)
- **He Who Fights with Monsters 1:** 33 visible → 34 visible (**+1 recovered**)

After restoring the original publication order, all 34 annotated books were swept and independently verified:

- 34 annotated books
- 407 total annotations
- 407 shared/visible annotations
- 0 visibility mismatches
- 0 new notes in the recovered delta

No raw highlight or note text was emitted by the CLI, MCP, cron receipt, tests, or proof output.

## Proven working contract

The working July/early-August job used this sequence:

1. discover annotated books from `GET /notes/{user_id}/load_more`;
2. mint one fresh CSRF from the authenticated notes index;
3. idempotently `PUT /notes/{book_id}/share` with `visible=true` for every annotated book;
4. fetch book detail pages after the write;
5. compare post-write UUID/count state against the stored baseline;
6. verify visible count equals total annotation count before advancing state.

`PUT visible=true` is idempotent. Running it for an already-public book is safe and returns the same publication receipt.

## Regressed contract

The replacement daily script changed the ordering:

1. fetch detail pages first;
2. compare `visible_count` and rendered `annotation_count`;
3. submit the publication write only when the pre-write counts differ.

That inference is invalid on Goodreads. The pre-write detail page can render only the already-visible rows. HWFWM2 therefore looked internally consistent at `2 visible / 2 rendered`, even though additional imported highlights had not been exposed. Because the values matched, the script skipped `PUT visible=true` indefinitely.

This was not a comments problem and not an Amazon/Kindle CLI problem. It was a Goodreads publication-order regression.

## Fixes

### Private daily cron

The deterministic daily script was restored to publish-all-first:

- every run sends the idempotent publication sweep for all discovered annotated books;
- all detail parsing and delta calculation happen after the sweep;
- every book must verify `visible_count == annotation_count`;
- the receipt distinguishes Goodreads review comments from annotations;
- the script reports the exact positive delta and the sweep verification count.

First repaired run:

```text
+15 highlights · +0 notes · 34 books checked
Publish sweep: 34/34 books accepted + verified
```

Second repaired run proved idempotence:

```text
No new Goodreads-visible changes
Publish sweep: 34/34 books accepted + verified
```

### Shared Goodreads engine / CLI / MCP

`notesBooks()` can now hydrate exact live detail metadata:

```bash
goodreads-cli notes books \
  --user-id 179929687 \
  --asin B08XVT2FKW \
  --details
```

The same fields are exposed by `goodreads_notes_books` with:

```json
{
  "userId": "179929687",
  "asins": ["B08XVT2FKW"],
  "details": true
}
```

Exact redacted result fields include:

- `annotationCount`
- `highlightCount`
- `noteCount`
- `visibleCount`
- `hiddenCount`
- `latestTimestamp`
- `detailsFetched`

ASIN filtering happens before detail hydration, so agents and crons can request exact counts for active books without sweeping historical detail pages or triggering avoidable throttling.

## Regression coverage

Added tests prove:

- highlight records are separated from attached notes;
- latest timestamps are parsed without emitting annotation bodies;
- live detail hydration returns exact visibility/count fields;
- ASIN filtering occurs before detail requests;
- a bounded worker pool does not stall all queued hydration behind one slow route;
- CLI/MCP stay on the same shared engine contract.

## Operational invariant

**Never suppress an idempotent Goodreads publication write using only pre-write discovery/detail counts.** Those counts can be incomplete until the write itself runs. Publish first, verify independently, then calculate and persist the delta.
