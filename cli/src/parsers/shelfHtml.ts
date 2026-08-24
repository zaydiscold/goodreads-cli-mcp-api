import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { cleanText, parseInteger, shortText } from "../lib.js";
import type { PageLink, ShelfBookRow, ShelfHtmlParse, ShelfInventoryItem } from "../types/index.js";

const GOODREADS_ORIGIN = "https://www.goodreads.com";

function goodreadsUrl(href: string | undefined | null): URL | null {
  if (!href) return null;
  try {
    const parsed = new URL(href, GOODREADS_ORIGIN);
    return parsed.origin === GOODREADS_ORIGIN ? parsed : null;
  } catch {
    return null;
  }
}

function relativeGoodreadsUrl(href: string | undefined | null): string | null {
  const parsed = goodreadsUrl(href);
  return parsed ? `${parsed.pathname}${parsed.search}` : null;
}

function parseShelfFromHref(href: string): string | null {
  return goodreadsUrl(href)?.searchParams.get("shelf") ?? null;
}

function parseBookId(href: string | null): string | null {
  const pathname = goodreadsUrl(href)?.pathname;
  const match = pathname?.match(/^\/book\/show\/(\d+)/);
  return match?.[1] ?? null;
}

function parseReviewId(rowId: string | undefined, checkboxName: string | undefined): string | null {
  const rowMatch = rowId?.match(/review_(\d+)/);
  if (rowMatch?.[1]) return rowMatch[1];
  const checkboxMatch = checkboxName?.match(/reviews\[(\d+)\]/);
  return checkboxMatch?.[1] ?? null;
}

function selectTextBookLink($: cheerio.CheerioAPI, row: cheerio.Cheerio<AnyNode>) {
  const textLink = row
    .find(
      "a.bookTitle[href*='/book/show/'], .field.title a[href*='/book/show/'], td.title a[href*='/book/show/']",
    )
    .filter((_, candidate) => Boolean(cleanText($(candidate).text())))
    .first();
  return textLink.length ? textLink : row.find("a[href*='/book/show/']").first();
}

export function parseShelfHtml(html: string): ShelfHtmlParse {
  const $ = cheerio.load(html);
  const title = cleanText($("title").first().text()) || null;
  const declaredBookCount = parseInteger(title?.match(/\(([\d,]+)\s+books?\)/)?.[1]);

  const shelfInventory: ShelfInventoryItem[] = [];
  const seenShelves = new Set<string>();
  $("a[href*='/review/list/'][href*='shelf=']").each((_, element) => {
    const rawHref = $(element).attr("href");
    const href = relativeGoodreadsUrl(rawHref);
    const rawLabel = cleanText($(element).text());
    if (!href || !rawLabel) return;

    const slug = parseShelfFromHref(href);
    if (!slug || slug.includes(",") || seenShelves.has(slug)) return;
    if (["-", "#", "Print", "My Books"].includes(rawLabel)) return;

    const count = parseInteger(rawLabel.match(/\(([\d,]+)\)/)?.[1]);
    const displayName = cleanText(rawLabel.replace(/\s*[\u200e]?\([\d,]+\)\s*$/, ""));
    if (!displayName) return;

    seenShelves.add(slug);
    shelfInventory.push({
      slug,
      displayName,
      count,
      href,
      kind: slug === "#ALL#" ? "account_all_books" : "account_shelf",
      isObservedForThisAccount: true,
    });
  });

  const rows: ShelfBookRow[] = [];
  const seenRows = new Set<string>();
  $("tr[id^='review_'], #booksBody tr, tr.bookalike").each((_, element) => {
    const row = $(element);
    const rowId = row.attr("id");
    const checkboxName = row.find("input[type='checkbox'][name^='reviews[']").first().attr("name");
    const reviewId = parseReviewId(rowId, checkboxName);
    const bookLink = selectTextBookLink($, row);
    const bookHref = relativeGoodreadsUrl(bookLink.attr("href"));
    const bookId = parseBookId(bookHref);
    const key = reviewId ?? bookId ?? bookHref ?? cleanText(row.text()).slice(0, 80);
    if (!key || seenRows.has(key)) return;
    seenRows.add(key);

    rows.push({
      reviewId,
      bookId,
      title: shortText(bookLink.text()),
      bookHref,
      author: shortText(
        row.find(".field.author a, td.author a, a.authorName, .authorName").first().text(),
      ),
      ratingText: shortText(
        row.find(".field.rating, td.rating, .staticStars, .stars").first().text(),
        80,
      ),
      shelfText: shortText(row.find(".field.shelves, td.shelves, .shelfName").first().text(), 120),
    });
  });

  const currentPage = parseInteger($("#reviewPagination em.current").first().text());
  const pageLinks: PageLink[] = [];
  const seenPageLinks = new Set<string>();
  $("#reviewPagination a[href*='page=']").each((_, element) => {
    const href = relativeGoodreadsUrl($(element).attr("href"));
    if (!href || seenPageLinks.has(href)) return;
    seenPageLinks.add(href);
    const page = parseInteger(goodreadsUrl(href)?.searchParams.get("page"));
    pageLinks.push({
      page,
      label: cleanText($(element).text()),
      href,
    });
  });

  return {
    kind: "shelf_html",
    title,
    declaredBookCount,
    currentPage,
    pageLinks,
    shelfInventory,
    rows,
  };
}
