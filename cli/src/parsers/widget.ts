import * as cheerio from "cheerio";
import { cleanText } from "../lib.js";

// Goodreads retired the public list_rss shelf feeds around 2026-10-28 (every
// user now 404s, signed in or not). The anonymous "custom widget" embed still
// serves a whole shelf, up to 100 books. It is a script that assigns the widget
// HTML to a single-quoted JS string, and Goodreads caches that output per
// (user, widget_id) while ignoring the other params on a cache hit, so every
// request needs its own widget_id and every response must be checked against
// the user and shelf it was asked for.

export const WIDGET_MAX_BOOKS = 100;

export interface ShelfWidgetItem {
  title: string | null;
  authorName: string | null;
  authorUrl: string | null;
  bookId: string | null;
  reviewId: string | null;
  reviewUrl: string | null;
  coverUrl: string | null;
  userRating: number | null;
}

export interface ShelfWidgetParse {
  kind: "shelf_widget";
  shelf: string;
  userPath: string;
  itemCount: number;
  items: ShelfWidgetItem[];
  signals: {
    widgetMayCapAt100: boolean;
  };
}

let widgetSeq = 0;

/** A widget_id no earlier request used, so Goodreads cannot answer from its cache. */
export function freshWidgetId(): string {
  widgetSeq = (widgetSeq + 1) % 1000;
  return `${Date.now()}${String(widgetSeq).padStart(3, "0")}`;
}

/** The widget path only accepts the numeric account id ("42-example-reader" -> "42"). */
export function widgetUserId(user: string): string {
  const id = user.trim().match(/^\d+/)?.[0];
  if (!id) {
    throw new Error(
      `the shelf widget needs a numeric Goodreads user id or an id-prefixed slug (got ${user})`,
    );
  }
  return id;
}

export function shelfWidgetPath(
  user: string,
  shelf: string,
  options: { widgetId?: string; sort?: string; order?: "a" | "d" } = {},
): string {
  const query = new URLSearchParams({
    shelf,
    sort: options.sort ?? "date_added",
    order: options.order ?? "d",
    num_books: String(WIDGET_MAX_BOOKS),
    show_title: "1",
    show_author: "1",
    show_cover: "1",
    show_rating: "1",
    widget_id: options.widgetId ?? freshWidgetId(),
  });
  return `/review/custom_widget/${widgetUserId(user)}.shelf?${query.toString()}`;
}

function widgetHtml(js: string): string | null {
  const match = js.match(/var widget_code = '((?:[^'\\]|\\.)*)'/);
  if (!match?.[1]) return null;
  return match[1].replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c));
}

function text(value: string | undefined | null): string | null {
  const cleaned = cleanText(value ?? "");
  return cleaned || null;
}

/**
 * Parse a custom_widget response. Throws when the body is not a widget or
 * describes a different user or shelf than requested, so an error page or a
 * stale cached widget is never mistaken for a real (possibly empty) shelf.
 */
export function parseShelfWidget(
  js: string,
  expected: { user: string; shelf: string },
): ShelfWidgetParse {
  const html = widgetHtml(String(js ?? ""));
  if (!html) throw new Error("Goodreads did not return a shelf widget");
  const $ = cheerio.load(html);

  const href = $("[class^='gr_custom_header_'] a").first().attr("href");
  let headerUrl: URL;
  try {
    headerUrl = new URL(href ?? "", "https://www.goodreads.com");
  } catch {
    throw new Error("shelf widget has no readable header link");
  }
  const userId = widgetUserId(expected.user);
  const userPath = headerUrl.pathname;
  if (!href || !new RegExp(`^/review/list/${userId}(?:[-.]|$)`).test(userPath)) {
    throw new Error(`shelf widget belongs to ${userPath}, not user ${userId}`);
  }
  const shelf = headerUrl.searchParams.get("shelf");
  if (shelf !== expected.shelf) {
    throw new Error(`shelf widget is for shelf ${shelf ?? "(none)"}, not ${expected.shelf}`);
  }

  const items = $("[class^='gr_custom_each_container_']")
    .toArray()
    .map((node): ShelfWidgetItem => {
      const each = $(node);
      const cover = each.find("[class^='gr_custom_book_container_'] a").first();
      const author = each.find("[class^='gr_custom_author_'] a").first();
      const reviewUrl = cover.attr("href") ?? null;
      const coverUrl = cover.find("img").attr("src") ?? null;
      const stars = each.find("[class^='gr_custom_rating_'] img");
      const active = stars.filter((_, img) => /_active\./.test($(img).attr("src") ?? "")).length;
      return {
        title: text(cover.attr("title")) ?? text(each.find("[class^='gr_custom_title_'] a").text()),
        authorName: text(author.text()),
        authorUrl: author.attr("href") ?? null,
        // Cover images are named <bookId>._SX50_.jpg; placeholder covers carry no id.
        bookId: coverUrl?.match(/\/(\d+)\.[^/]*$/)?.[1] ?? null,
        reviewId: reviewUrl?.match(/\/review\/show\/(\d+)/)?.[1] ?? null,
        reviewUrl: reviewUrl ? reviewUrl.replace(/[?&]utm_[^&]*/g, "").replace(/\?$/, "") : null,
        coverUrl,
        userRating: stars.length ? active : null,
      };
    });

  return {
    kind: "shelf_widget",
    shelf,
    userPath,
    itemCount: items.length,
    items,
    signals: { widgetMayCapAt100: items.length >= WIDGET_MAX_BOOKS },
  };
}
