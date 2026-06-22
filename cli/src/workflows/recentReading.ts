import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notesVerifyRoute } from "../lib.js";
import { parseNotesPage } from "../parsers/notesPage.js";
import { readShelfPagesFromFixtureDir, summarizeShelfPages } from "../shelf.js";
import type { NotesPageParse, ShelfBookRow } from "../types/index.js";

export const NOTES_PUBLICIZE_ENV_GATE = "GOODREADS_ALLOW_NOTES_PUBLICIZE";

export interface RecentReadingOptions {
  fixtureDir: string;
  shelves: string[];
  limit: number;
}

export interface RecentReadingNotesOptions extends RecentReadingOptions {
  notesIndexFixture?: string;
}

export interface NotesPublicizeWorkflowOptions {
  bookId: string;
  bookSlug?: string;
  userSlug?: string;
  detailFixture?: string;
  approvedBookIds?: string[];
}

export interface PublicizeApprovalCheck {
  approved: boolean;
  executeRequested: boolean;
  envGatePresent: boolean;
  blockers: string[];
}

async function parseNotesIndex(
  fixtureDir: string,
  explicitFixture?: string,
): Promise<NotesPageParse | null> {
  const candidates = explicitFixture
    ? [explicitFixture]
    : [join(fixtureDir, "notes-index.html"), join(fixtureDir, "notes.html")];
  const fixture = candidates.find((candidate) => existsSync(candidate));
  if (!fixture) return null;
  return parseNotesPage(await readFile(fixture, "utf8"));
}

export async function buildRecentReadingList(options: RecentReadingOptions) {
  const shelves = [...new Set(options.shelves)];
  const warnings: string[] = [];
  const perShelf = [];
  const booksByKey = new Map<
    string,
    ShelfBookRow & { shelves: string[]; commentRoute: string | null }
  >();

  for (const shelf of shelves) {
    const pages = await readShelfPagesFromFixtureDir(options.fixtureDir, shelf);
    if (pages.length === 0) {
      warnings.push(`No shelf fixtures found for '${shelf}' in ${options.fixtureDir}.`);
      continue;
    }
    const result = summarizeShelfPages(pages);
    perShelf.push({
      shelf,
      pagination: result.pagination,
      discoveredShelves: result.shelfInventory,
    });
    if (!result.pagination.complete) warnings.push(`Shelf '${shelf}' is incomplete.`);

    for (const row of result.rows) {
      const key = row.bookId ?? row.reviewId ?? row.bookHref ?? row.title;
      if (!key) continue;
      const existing = booksByKey.get(key);
      if (existing) {
        existing.shelves.push(shelf);
      } else {
        booksByKey.set(key, {
          ...row,
          shelves: [shelf],
          commentRoute: null,
        });
      }
    }
  }

  return {
    shelves,
    perShelf,
    books: [...booksByKey.values()].slice(0, options.limit),
    warnings,
  };
}

export async function buildRecentReadingNotes(options: RecentReadingNotesOptions) {
  const recent = await buildRecentReadingList(options);
  const notesIndex = await parseNotesIndex(options.fixtureDir, options.notesIndexFixture);
  const warnings = [...recent.warnings];
  if (!notesIndex) {
    warnings.push("No notes index fixture found; note-link join could not run.");
  }

  const linksByBookId = new Map<string, NotesPageParse["noteBookLinks"][number]>();
  for (const link of notesIndex?.noteBookLinks ?? []) {
    if (link.bookId) linksByBookId.set(link.bookId, link);
  }

  const books = recent.books.map((book) => {
    const notesLink = book.bookId ? (linksByBookId.get(book.bookId) ?? null) : null;
    return {
      ...book,
      notes: {
        hasNotesIndexMatch: Boolean(notesLink),
        notesHref: notesLink?.href ?? null,
        notesBookSlug: notesLink?.bookSlug ?? null,
        notesUserSlug: notesLink?.userSlug ?? null,
        detailStatus: notesLink ? "detail-not-loaded" : "no-index-match",
      },
      comments: {
        routeAvailable: Boolean(book.bookId || book.reviewId),
        defaultRouteTemplate: "/comment/list/{user_slug}",
      },
    };
  });

  return {
    shelves: recent.shelves,
    perShelf: recent.perShelf,
    notesIndex: notesIndex
      ? {
          noteBookLinkCount: notesIndex.noteBookLinks.length,
          noteCount: notesIndex.noteCount,
          visibleNoteCount: notesIndex.visibleNoteCount,
          hiddenNoteCount: notesIndex.hiddenNoteCount,
        }
      : null,
    books,
    warnings,
  };
}

export async function buildRecentReadingPublicizePlan(
  options: RecentReadingNotesOptions & { approvedBookIds: string[] },
) {
  const joined = await buildRecentReadingNotes(options);
  const approved = new Set(options.approvedBookIds);
  return {
    ...joined,
    publicize: joined.books
      .filter((book) => book.bookId && book.notes.hasNotesIndexMatch)
      .map((book) => ({
        bookId: book.bookId,
        title: book.title,
        approved: book.bookId ? approved.has(book.bookId) : false,
        method: "PUT",
        route: `/notes/${book.bookId}/share`,
        verifyRoute:
          book.notes.notesBookSlug && book.notes.notesUserSlug
            ? `/notes/${book.notes.notesBookSlug}/${book.notes.notesUserSlug}`
            : null,
        dryRun: true,
        executeGate: {
          executeFlag: "--execute",
          env: NOTES_PUBLICIZE_ENV_GATE,
          approvedBookId: book.bookId,
        },
        proofPolicy:
          "Write sanitized counts/status/timing only; never raw highlight text, comments, cookies, CSRF tokens, or private URLs.",
      })),
  };
}

export async function buildNotesPublicizeWorkflowPlan(options: NotesPublicizeWorkflowOptions) {
  const detail = options.detailFixture
    ? parseNotesPage(await readFile(options.detailFixture, "utf8"))
    : null;
  const detailBookSlug =
    detail?.noteBookLinks.find((link) => link.bookId === options.bookId)?.bookSlug ??
    detail?.noteBookLinks[0]?.bookSlug ??
    null;
  const verifyBookSlug = options.bookSlug ?? detailBookSlug ?? undefined;
  const approved = Boolean(options.approvedBookIds?.includes(options.bookId));
  const visible = detail?.visibleNoteCount ?? null;
  const total = detail?.noteCount ?? null;
  const alreadyFullyVisible = total !== null && total > 0 && visible === total;
  const shelfGateDetected = Boolean(detail?.shelfGateDetected);
  const blockers: string[] = [];
  if (shelfGateDetected)
    blockers.push("notes detail page appears shelf-gated; do not auto-add shelves");
  if (!approved) blockers.push("book id is not in the explicit approved-book-id list");

  return {
    bookId: options.bookId,
    bookSlug: verifyBookSlug ?? null,
    userSlug: options.userSlug ?? null,
    route: `/notes/${options.bookId}/share`,
    method: "PUT",
    verifyRouteTemplate: "/notes/{book_slug}/{user_slug}",
    verifyRoute: options.userSlug
      ? notesVerifyRoute({ bookSlug: verifyBookSlug, userSlug: options.userSlug })
      : null,
    verifyBookSlugKnown: Boolean(verifyBookSlug),
    dryRun: true,
    approved,
    detail: detail
      ? {
          noteCount: detail.noteCount,
          visibleNoteCount: detail.visibleNoteCount,
          hiddenNoteCount: detail.hiddenNoteCount,
          notePersistEndpointCount: detail.notePersistEndpointCount,
          spoilerToggleCount: detail.spoilerToggleCount,
          shelfGateDetected: detail.shelfGateDetected,
          alreadyFullyVisible,
        }
      : null,
    action: alreadyFullyVisible ? "noop-already-public" : "publicize-notes",
    blockers,
    workflowSteps: [
      "load notes detail page",
      "extract counts and visibility without highlight text",
      "stop if shelf gate appears",
      "require --execute, approved book id, and GOODREADS_ALLOW_NOTES_PUBLICIZE=1",
      "PUT /notes/{book_id}/share",
      "reload /notes/{book_slug}/{user_slug}",
      "verify visible count equals total count",
      "write sanitized proof",
    ],
  };
}

export function checkPublicizeApproval(options: {
  bookId: string;
  approvedBookIds: string[];
  execute: boolean;
  env?: NodeJS.ProcessEnv;
}): PublicizeApprovalCheck {
  const env = options.env ?? process.env;
  const blockers: string[] = [];
  const approved = options.approvedBookIds.includes(options.bookId);
  const envGatePresent = env[NOTES_PUBLICIZE_ENV_GATE] === "1";
  if (!options.execute) blockers.push("--execute is required for live notes publicizing");
  if (!approved) blockers.push(`--approved-book-id ${options.bookId} is required`);
  if (!envGatePresent) blockers.push(`${NOTES_PUBLICIZE_ENV_GATE}=1 is required`);
  return {
    approved,
    executeRequested: options.execute,
    envGatePresent,
    blockers,
  };
}
