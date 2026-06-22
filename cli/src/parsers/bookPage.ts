import * as cheerio from "cheerio";
import { cleanText } from "../lib.js";
import type { BookPageParse } from "../types/index.js";

function summarizeTypenames(value: unknown, counts: Map<string, number>): void {
  if (Array.isArray(value)) {
    for (const item of value) summarizeTypenames(item, counts);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.__typename === "string") {
    counts.set(record.__typename, (counts.get(record.__typename) ?? 0) + 1);
  }
  for (const nested of Object.values(record)) summarizeTypenames(nested, counts);
}

export function parseBookPage(html: string): BookPageParse {
  const $ = cheerio.load(html);
  const jsonLdBooks: Record<string, unknown>[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).text();
    if (!raw.trim()) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const records = Array.isArray(parsed) ? parsed : [parsed];
      for (const record of records) {
        if (record && typeof record === "object")
          jsonLdBooks.push(record as Record<string, unknown>);
      }
    } catch {
      // Ignore malformed embedded JSON-LD.
    }
  });

  const primary = jsonLdBooks.find((record) => record["@type"] === "Book") ?? jsonLdBooks[0] ?? {};
  const authorRaw = primary.author;
  const authors = (Array.isArray(authorRaw) ? authorRaw : [authorRaw])
    .filter(
      (author): author is Record<string, unknown> => Boolean(author) && typeof author === "object",
    )
    .map((author) => (typeof author.name === "string" ? author.name : null))
    .filter((name): name is string => Boolean(name));

  const aggregate =
    primary.aggregateRating && typeof primary.aggregateRating === "object"
      ? (primary.aggregateRating as Record<string, unknown>)
      : {};

  let nextData: Record<string, unknown> | null = null;
  const nextRaw = $("#__NEXT_DATA__").first().text();
  if (nextRaw.trim()) {
    try {
      nextData = JSON.parse(nextRaw) as Record<string, unknown>;
    } catch {
      nextData = null;
    }
  }
  const typenameCounts = new Map<string, number>();
  if (nextData) summarizeTypenames(nextData, typenameCounts);
  const sortedTypenames = Object.fromEntries(
    [...typenameCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
  );

  return {
    kind: "book_page",
    title: cleanText($("title").first().text()) || null,
    jsonLdBook: {
      name: typeof primary.name === "string" ? primary.name : null,
      bookFormat: typeof primary.bookFormat === "string" ? primary.bookFormat : null,
      numberOfPages:
        typeof primary.numberOfPages === "number" || typeof primary.numberOfPages === "string"
          ? primary.numberOfPages
          : null,
      inLanguage: typeof primary.inLanguage === "string" ? primary.inLanguage : null,
      authors,
      ratingValue:
        typeof aggregate.ratingValue === "number" || typeof aggregate.ratingValue === "string"
          ? aggregate.ratingValue
          : null,
      ratingCount:
        typeof aggregate.ratingCount === "number" || typeof aggregate.ratingCount === "string"
          ? aggregate.ratingCount
          : null,
      reviewCount:
        typeof aggregate.reviewCount === "number" || typeof aggregate.reviewCount === "string"
          ? aggregate.reviewCount
          : null,
    },
    hasNextData: nextData !== null,
    nextDataTopLevelKeys: nextData ? Object.keys(nextData).sort() : [],
    nextDataTypenames: sortedTypenames,
  };
}
