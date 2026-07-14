import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseShelfHtml } from "./parsers/shelfHtml.js";
import type {
  PaginationSummary,
  ShelfBookRow,
  ShelfHtmlParse,
  ShelfInventoryItem,
} from "./types/index.js";

// Shared shelf-page helpers used by BOTH the `books` engine ops and the
// recent-reading workflow. They previously existed as two near-identical
// copies (commands/books.ts + workflows/recentReading.ts); centralizing them
// here keeps shelf parsing single-sourced so the two paths cannot drift.

export function pageNumber(parsed: ShelfHtmlParse): number {
  return parsed.currentPage ?? 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function shelfSlugFromFixtureFilename(file: string): string | null {
  const standard = file.match(/^shelf-(.+?)(?:-page\d+)?\.html$/)?.[1];
  if (standard) return standard;
  return file.match(/^(.+?)-shelf(?:-page\d+)?\.html$/)?.[1] ?? null;
}

export async function readShelfPagesFromFixtureDir(
  dir: string,
  shelf: string,
): Promise<ShelfHtmlParse[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const escapedShelf = escapeRegExp(shelf);
  const standardPage = new RegExp(`^shelf-${escapedShelf}-page\\d+\\.html$`);
  const alternatePage = new RegExp(`^${escapedShelf}-shelf-page\\d+\\.html$`);
  const candidates = files
    .filter(
      (file) =>
        file === `shelf-${shelf}.html` ||
        file === `${shelf}-shelf.html` ||
        standardPage.test(file) ||
        alternatePage.test(file),
    )
    .sort((a, b) => {
      const pageA = Number(a.match(/page(\d+)/)?.[1] ?? "1");
      const pageB = Number(b.match(/page(\d+)/)?.[1] ?? "1");
      return pageA - pageB;
    });
  return Promise.all(
    candidates.map(async (file) => parseShelfHtml(await readFile(join(dir, file), "utf8"))),
  );
}

export interface ShelfSummary {
  rows: ShelfBookRow[];
  pagination: PaginationSummary;
  shelfInventory: ShelfInventoryItem[];
}

export function summarizeShelfPages(pages: ShelfHtmlParse[]): ShelfSummary {
  const rowMap = new Map<string, ShelfBookRow>();
  const declaredCounts = new Set<number>();
  const pagesSeen = new Set<number>();
  const shelfInventory = new Map<string, ShelfInventoryItem>();

  for (const page of pages) {
    if (page.declaredBookCount !== null) declaredCounts.add(page.declaredBookCount);
    pagesSeen.add(pageNumber(page));
    for (const shelf of page.shelfInventory) shelfInventory.set(shelf.slug, shelf);
    for (const row of page.rows) {
      const key = row.reviewId ?? row.bookId ?? row.bookHref ?? row.title;
      if (key) rowMap.set(key, row);
    }
  }

  const declaredCount = declaredCounts.size === 1 ? ([...declaredCounts][0] ?? null) : null;
  const rows = [...rowMap.values()];
  return {
    rows,
    shelfInventory: [...shelfInventory.values()],
    pagination: {
      mode: "auto",
      pagesSeen: [...pagesSeen].sort((a, b) => a - b),
      declaredCount,
      parsedCount: rows.length,
      complete: declaredCount !== null && rows.length === declaredCount,
    },
  };
}
