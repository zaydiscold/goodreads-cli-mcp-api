import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { cleanText } from "../lib.js";

type DiscoveryBook = {
  bookId: string;
  title: string | null;
  author: string | null;
  ratingSummary: string | null;
};

function bookIdFromHref(href: string | undefined): string | null {
  const match = href?.match(/^\/book\/show\/(\d+)(?:[.-][^?]*)?(?:\?.*)?$/);
  return match?.[1] ?? null;
}

function firstText($root: cheerio.Cheerio<AnyNode>, selector: string): string | null {
  return cleanText($root.find(selector).first().text()) || null;
}

function cardText(link: cheerio.Cheerio<AnyNode>, selector: string): string | null {
  const card = link.closest("tr, .elementList, .bookBox");
  return (
    firstText(card, selector) ||
    cleanText(link.parent().find(selector).first().text()) ||
    cleanText(link.nextAll(selector).first().text()) ||
    null
  );
}

function dedupeBooks(books: DiscoveryBook[]): DiscoveryBook[] {
  const seen = new Set<string>();
  return books.filter((book) => {
    if (seen.has(book.bookId)) return false;
    seen.add(book.bookId);
    return true;
  });
}

/** Parses public discovery cards without retaining descriptions, reviews, or image URLs. */
export function parseSearchResultsPage(html: string): {
  kind: "search_results";
  resultCountLabel: string | null;
  books: DiscoveryBook[];
} {
  const $ = cheerio.load(html);
  const books = $("a.bookTitle[href*='/book/show/']")
    .map((_, element) => {
      const link = $(element);
      const bookId = bookIdFromHref(link.attr("href"));
      if (!bookId) return null;
      return {
        bookId,
        title: cleanText(link.text()) || null,
        author: cardText(link, ".authorName"),
        ratingSummary: cardText(link, ".minirating"),
      };
    })
    .get()
    .filter((book): book is DiscoveryBook => book !== null);
  const resultCountLabel =
    cleanText($(".searchSubNavContainer, .searchSubNav").first().text()) || null;
  return { kind: "search_results", resultCountLabel, books: dedupeBooks(books) };
}

/** Parses personalized recommendation cards into book identity only. */
export function parseRecommendationsPage(html: string): {
  kind: "recommendations";
  books: DiscoveryBook[];
} {
  const $ = cheerio.load(html);
  const books = $(".bookBox")
    .map((_, element) => {
      const card = $(element);
      const link = card.find("a[href*='/book/show/']").first();
      const bookId = bookIdFromHref(link.attr("href"));
      if (!bookId) return null;
      const book: DiscoveryBook = {
        bookId,
        title: cleanText(link.find("img").attr("alt") ?? "") || null,
        author: null,
        ratingSummary: null,
      };
      return book;
    })
    .get()
    .filter((book): book is DiscoveryBook => book !== null);
  return { kind: "recommendations", books: dedupeBooks(books) };
}

/** Parses public author identity and bibliography metadata without bio/review text. */
export function parseAuthorPage(html: string): {
  kind: "author";
  name: string | null;
  bioLength: number;
  books: DiscoveryBook[];
} {
  const $ = cheerio.load(html);
  const books = $("a.bookTitle[href*='/book/show/']")
    .map((_, element) => {
      const link = $(element);
      const bookId = bookIdFromHref(link.attr("href"));
      if (!bookId) return null;
      return {
        bookId,
        title: cleanText(link.text()) || null,
        author: cardText(link, ".authorName__container, .authorName"),
        ratingSummary: cardText(link, ".minirating"),
      };
    })
    .get()
    .filter((book): book is DiscoveryBook => book !== null);
  return {
    kind: "author",
    name: cleanText($("h1.authorName, h1").first().text()) || null,
    bioLength: cleanText($(".aboutAuthorInfo").first().text()).length,
    books: dedupeBooks(books),
  };
}
