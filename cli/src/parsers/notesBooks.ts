export interface NotesBookSummary {
  asin: string | null;
  title: string | null;
  author: string | null;
  sharedCount: number | null;
  highlightCount: number | null;
  highlightCountAvailable: boolean;
  noteCount: number | null;
  noteCountAvailable: boolean;
  notesPath: string | null;
  noSharedAnnotations: boolean | null;
}

export interface NotesBooksParse {
  kind: "notes_books";
  bookCount: number;
  books: NotesBookSummary[];
  nextTokenPresent: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(value: unknown): number | null {
  const candidate =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(candidate) && candidate >= 0 ? candidate : null;
}

function safeNotesPath(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw, "https://www.goodreads.com");
    if (url.hostname !== "www.goodreads.com" && url.hostname !== "goodreads.com") return null;
    return url.pathname.startsWith("/notes/") ? url.pathname : null;
  } catch {
    return null;
  }
}

function tokenPresent(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value as object).length > 0;
  return value !== null && value !== undefined && value !== "";
}

export function parseNotesBooksPayload(payload: unknown): NotesBooksParse {
  const root = record(payload);
  const rows = Array.isArray(root.annotated_books_collection)
    ? root.annotated_books_collection
    : [];
  const books = rows.map((value): NotesBookSummary => {
    const row = record(value);
    const highlightCount = count(row.highlightCount);
    const noteCount = count(row.noteCount);
    return {
      asin: text(row.asin),
      title: text(row.title),
      author: text(row.authorName),
      sharedCount: count(row.sharedCount),
      highlightCount,
      highlightCountAvailable: highlightCount !== null,
      noteCount,
      noteCountAvailable: noteCount !== null,
      notesPath: safeNotesPath(row.readingNotesUrl),
      noSharedAnnotations:
        typeof row.noSharedAnnotations === "boolean" ? row.noSharedAnnotations : null,
    };
  });
  return {
    kind: "notes_books",
    bookCount: books.length,
    books,
    nextTokenPresent: tokenPresent(root.next_token),
  };
}
