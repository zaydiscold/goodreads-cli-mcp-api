import { XMLParser } from "fast-xml-parser";
import { asArray, cleanText } from "../lib.js";
import type { ShelfRssItem, ShelfRssParse } from "../types/index.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

function value(input: unknown): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    const text = cleanText(String(input));
    return text || null;
  }
  if (typeof input !== "object" || Array.isArray(input)) return null;

  const record = input as Record<string, unknown>;
  for (const key of ["#text", "__cdata"]) {
    if (key in record) return value(record[key]);
  }
  return null;
}

function userRating(input: unknown): number | null {
  const text = value(input);
  if (!text) return null;
  const candidate = Number(text);
  return Number.isInteger(candidate) && candidate >= 0 && candidate <= 5 ? candidate : null;
}

export function parseShelfRss(xml: string): ShelfRssParse {
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { title?: unknown; item?: unknown[] | unknown } };
  };
  const channel = parsed.rss?.channel ?? {};
  const items = asArray(channel.item).map((item): ShelfRssItem => {
    const record = (item ?? {}) as Record<string, unknown>;
    const description = value(record.book_description);
    const review = value(record.user_review);
    return {
      title: value(record.title),
      link: value(record.link),
      guid: value(record.guid),
      bookId: value(record.book_id),
      authorName: value(record.author_name),
      isbn: value(record.isbn),
      userRating: userRating(record.user_rating),
      userReadAt: value(record.user_read_at),
      userDateAdded: value(record.user_date_added),
      userDateCreated: value(record.user_date_created),
      userShelves: value(record.user_shelves),
      averageRating: value(record.average_rating),
      bookPublished: value(record.book_published),
      hasBookDescription: Boolean(description),
      bookDescriptionLength: description?.length ?? 0,
      hasUserReview: Boolean(review),
      userReviewLength: review?.length ?? 0,
    };
  });

  return {
    kind: "shelf_rss",
    channelTitle: value(channel.title),
    itemCount: items.length,
    items,
    signals: {
      rssMayCapAt100: items.length === 100,
    },
  };
}
