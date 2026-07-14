import * as cheerio from "cheerio";
import { cleanText } from "../lib.js";
import type { NotesPageParse } from "../types/index.js";

function parseNotesHref(href: string): {
  bookSlug: string | null;
  bookId: string | null;
  userSlug: string | null;
} {
  const match = href.match(/\/notes\/([^/?#]+)\/([^/?#]+)/);
  const bookSlug = match?.[1] ?? null;
  const userSlug = match?.[2] ?? null;
  const bookId = bookSlug?.match(/^(\d+)/)?.[1] ?? null;
  return { bookSlug, bookId, userSlug };
}

export function parseNotesPage(html: string): NotesPageParse {
  const $ = cheerio.load(html);
  const notes: NotesPageParse["notes"] = [];
  const visibleCounts = new Map<string, number>();

  $(".js-readingNote, [data-note-persist-endpoint], [data-annotation-pair-id]").each(
    (_, element) => {
      const node = $(element);
      const visible = node.attr("data-visible") ?? null;
      visibleCounts.set(String(visible), (visibleCounts.get(String(visible)) ?? 0) + 1);
      notes.push({
        annotationPairId: node.attr("data-annotation-pair-id") ?? null,
        visible,
        notePersistEndpoint: node.attr("data-note-persist-endpoint") ?? null,
        hasSpoilerToggle: node.find("input[type='checkbox'], .js-spoiler").length > 0,
      });
    },
  );

  const noteBookLinks: NotesPageParse["noteBookLinks"] = [];
  $("a[href*='/notes/']").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const label = cleanText($(element).text());
    if (!label) return;
    const parsedHref = parseNotesHref(href);
    noteBookLinks.push({
      href,
      bookSlug: parsedHref.bookSlug,
      bookId: parsedHref.bookId,
      userSlug: parsedHref.userSlug,
      labelLength: label.length,
    });
  });

  const visibleNoteCount = notes.filter((note) => note.visible === "true").length;
  const hiddenNoteCount = notes.filter((note) => note.visible === "false").length;
  const notePersistEndpointCount = notes.filter((note) => note.notePersistEndpoint).length;
  const spoilerToggleCount = notes.filter((note) => note.hasSpoilerToggle).length;
  const shelfGateDetected = /add\s+to\s+shelf|shelf\s+gate|must\s+add/i.test(
    cleanText($("body").text()),
  );

  return {
    kind: "notes_page",
    title: cleanText($("title").first().text()) || null,
    noteCount: notes.length,
    visibleNoteCount,
    hiddenNoteCount,
    notePersistEndpointCount,
    spoilerToggleCount,
    shelfGateDetected,
    visibleCounts: Object.fromEntries(visibleCounts.entries()),
    notes,
    noteBookLinks,
  };
}

export function redactNotesPrivateIdentifiers(parsed: NotesPageParse): NotesPageParse {
  return {
    ...parsed,
    notes: parsed.notes.map((note) => ({
      ...note,
      annotationPairId: note.annotationPairId ? "<redacted>" : null,
      notePersistEndpoint: note.notePersistEndpoint ? "<redacted>" : null,
    })),
  };
}
