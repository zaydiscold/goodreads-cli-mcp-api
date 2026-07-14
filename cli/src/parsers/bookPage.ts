import * as cheerio from "cheerio";
import { cleanText } from "../lib.js";
import type { BookPageParse } from "../types/index.js";

type JsonRecord = Record<string, unknown>;

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

function parseEmbeddedJson(raw: string): unknown | null {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function collectJsonLdBooks($: cheerio.CheerioAPI): JsonRecord[] {
  const books: JsonRecord[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    const parsed = parseEmbeddedJson($(element).text());
    const records = Array.isArray(parsed) ? parsed : [parsed];
    for (const record of records) {
      if (record && typeof record === "object") books.push(record as JsonRecord);
    }
  });
  return books;
}

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function authorNames(primary: JsonRecord): string[] {
  const values = Array.isArray(primary.author) ? primary.author : [primary.author];
  return values
    .map(recordValue)
    .map((author) => (typeof author.name === "string" ? author.name : null))
    .filter((name): name is string => Boolean(name));
}

function scalar(value: unknown): string | number | null {
  return typeof value === "number" || typeof value === "string" ? value : null;
}

function nextDataFrom($: cheerio.CheerioAPI): JsonRecord | null {
  const parsed = parseEmbeddedJson($("#__NEXT_DATA__").first().text());
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as JsonRecord)
    : null;
}

function typenameSummary(nextData: JsonRecord | null): Record<string, number> {
  const counts = new Map<string, number>();
  if (nextData) summarizeTypenames(nextData, counts);
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40));
}

export function parseBookPage(html: string): BookPageParse {
  const $ = cheerio.load(html);
  const jsonLdBooks = collectJsonLdBooks($);
  const primary = jsonLdBooks.find((record) => record["@type"] === "Book") ?? jsonLdBooks[0] ?? {};
  const aggregate = recordValue(primary.aggregateRating);
  const nextData = nextDataFrom($);

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
      authors: authorNames(primary),
      ratingValue: scalar(aggregate.ratingValue),
      ratingCount: scalar(aggregate.ratingCount),
      reviewCount: scalar(aggregate.reviewCount),
    },
    hasNextData: nextData !== null,
    nextDataTopLevelKeys: nextData ? Object.keys(nextData).sort() : [],
    nextDataTypenames: typenameSummary(nextData),
  };
}
