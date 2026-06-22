import * as cheerio from "cheerio";
import { cleanText, parseInteger, shortText } from "../lib.js";
import type { PageLink, ShelfBookRow, ShelfHtmlParse, ShelfInventoryItem } from "../types/index.js";

function parseShelfFromHref(href: string): string | null {
  try {
    const parsed = new URL(href, "https://www.goodreads.com");
    return parsed.searchParams.get("shelf");
  } catch {
    return null;
  }
}

function parseBookId(href: string | null): string | null {
  if (!href) return null;
  const match = href.match(/\/book\/show\/(\d+)/);
  return match?.[1] ?? null;
}

function parseReviewId(rowId: string | undefined, checkboxName: string | undefined): string | null {
  const rowMatch = rowId?.match(/review_(\d+)/);
  if (rowMatch?.[1]) return rowMatch[1];
  const checkboxMatch = checkboxName?.match(/reviews\[(\d+)\]/);
  return checkboxMatch?.[1] ?? null;
}

export function parseShelfHtml(html: string): ShelfHtmlParse {
  const $ = cheerio.load(html);
  const title = cleanText($("title").first().text()) || null;
  const declaredBookCount = parseInteger(title?.match(/\((\d+)\s+books?\)/)?.[1]);

  const shelfInventory: ShelfInventoryItem[] = [];
  const seenShelves = new Set<string>();
  $("a[href*='/review/list/'][href*='shelf=']").each((_, element) => {
    const href = $(element).attr("href");
    const rawLabel = cleanText($(element).text());
    if (!href || !rawLabel) return;

    const slug = parseShelfFromHref(href);
    if (!slug || slug.includes(",") || seenShelves.has(slug)) return;
    if (["-", "#", "Print", "My Books"].includes(rawLabel)) return;

    const count = parseInteger(rawLabel.match(/\((\d+)\)/)?.[1]);
    const displayName = cleanText(rawLabel.replace(/\s*[‎\u200e]?\(\d+\)\s*$/, ""));
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
    const bookLink = row.find("a[href*='/book/show/']").first();
    const bookHref = bookLink.attr("href") ?? null;
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
  $("#reviewPagination a[href*='page=']").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const page = parseInteger(new URL(href, "https://www.goodreads.com").searchParams.get("page"));
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
