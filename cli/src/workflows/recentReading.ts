import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notesVerifyRoute } from "../lib.js";
import { parseNotesPage } from "../parsers/notesPage.js";
import { readShelfPagesFromFixtureDir, summarizeShelfPages } from "../shelf.js";
import type { NotesPageParse, ShelfBookRow } from "../types/index.js";

export const NOTES_PUBLICIZE_ENV_GATE = "GOODREADS_ALLOW_NOTES_PUBLICIZE";
const MAX_RECENT_READING_ITEMS = 200;

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

interface DetailIdentity {
  matched: boolean;
  conflicting: boolean;
  observedBookLinkCount: number;
}

function normalizedRecentReadingOptions(options: RecentReadingOptions): {
  shelves: string[];
  limit: number;
} {
  if (
    !Number.isInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > MAX_RECENT_READING_ITEMS
  ) {
    throw new Error(`limit must be an integer from 1 to ${MAX_RECENT_READING_ITEMS}`);
  }
  const shelves = [...new Set(options.shelves.map((shelf) => shelf.trim()).filter(Boolean))];
  if (shelves.length === 0) throw new Error("at least one shelf slug is required");
  return { shelves, limit: options.limit };
}

async function parseNotesIndex(
  fixtureDir: string,
  explicitFixture?: string,
): Promise<{ page: NotesPageParse | null; fixture: string | null }> {
  if (explicitFixture) {
    if (!existsSync(explicitFixture)) {
      throw new Error("Explicit notes index fixture was not found");
    }
    return {
      page: parseNotesPage(await readFile(explicitFixture, "utf8")),
      fixture: explicitFixture,
    };
  }

  const candidates = [join(fixtureDir, "notes-index.html"), join(fixtureDir, "notes.html")];
  const fixture = candidates.find((candidate) => existsSync(candidate)) ?? null;
  if (!fixture) return { page: null, fixture: null };
  return { page: parseNotesPage(await readFile(fixture, "utf8")), fixture };
}

export async function buildRecentReadingList(options: RecentReadingOptions) {
  const { shelves, limit } = normalizedRecentReadingOptions(options);
  const warnings: string[] = [];
  const perShelf = [];
  const booksByKey = new Map<string, ShelfBookRow & { shelves: string[] }>();

  for (const shelf of shelves) {
    const pages = await readShelfPagesFromFixtureDir(options.fixtureDir, shelf);
    if (pages.length === 0) {
      warnings.push(`No shelf fixtures found for '${shelf}'.`);
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
        if (!existing.shelves.includes(shelf)) existing.shelves.push(shelf);
      } else {
        booksByKey.set(key, { ...row, shelves: [shelf] });
      }
    }
  }

  return {
    shelves,
    perShelf,
    books: [...booksByKey.values()].slice(0, limit),
    warnings,
  };
}

export async function buildRecentReadingNotes(options: RecentReadingNotesOptions) {
  const recent = await buildRecentReadingList(options);
  const loadedNotesIndex = await parseNotesIndex(options.fixtureDir, options.notesIndexFixture);
  const notesIndex = loadedNotesIndex.page;
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
    const commentUserSlug = notesLink?.userSlug ?? null;
    return {
      ...book,
      notes: {
        hasNotesIndexMatch: Boolean(notesLink),
        notesHref: notesLink?.href ?? null,
        notesBookSlug: notesLink?.bookSlug ?? null,
        notesUserSlug: commentUserSlug,
        detailStatus: notesLink ? "detail-not-loaded" : "no-index-match",
      },
      comments: {
        routeAvailable: Boolean(commentUserSlug),
        userSlugKnown: Boolean(commentUserSlug),
        routeResolvable: Boolean(commentUserSlug),
        defaultRouteTemplate: "/comment/list/{user_slug}",
        route: commentUserSlug ? `/comment/list/${encodeURIComponent(commentUserSlug)}` : null,
      },
    };
  });

  return {
    shelves: recent.shelves,
    perShelf: recent.perShelf,
    notesIndex: notesIndex
      ? {
          fixtureLoaded: true,
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

async function loadNotesDetail(fixture: string | undefined): Promise<NotesPageParse | null> {
  if (!fixture) return null;
  if (!existsSync(fixture)) throw new Error("Explicit notes detail fixture was not found");
  return parseNotesPage(await readFile(fixture, "utf8"));
}

function matchingNotesLink(detail: NotesPageParse | null, bookId: string) {
  return detail?.noteBookLinks.find((link) => link.bookId === bookId) ?? null;
}

function notesDetailIdentity(detail: NotesPageParse | null, bookId: string): DetailIdentity {
  const links = detail?.noteBookLinks ?? [];
  const matched = links.some((link) => link.bookId === bookId);
  return {
    matched,
    conflicting: links.length > 0 && !matched,
    observedBookLinkCount: links.length,
  };
}

function isFullyVisible(detail: NotesPageParse | null): boolean {
  if (!detail || detail.noteCount < 1) return false;
  return detail.visibleNoteCount === detail.noteCount;
}

function workflowBlockers(options: {
  detail: NotesPageParse | null;
  approved: boolean;
  identity: DetailIdentity;
  routeResolvable: boolean;
}): string[] {
  const blockers: string[] = [];
  if (options.detail?.shelfGateDetected) {
    blockers.push("notes detail page appears shelf-gated; do not auto-add shelves");
  }
  if (options.identity.conflicting) {
    blockers.push("notes detail fixture does not match the requested book id");
  }
  if (!options.routeResolvable) {
    blockers.push("verification route is not resolvable for the requested book and user");
  }
  if (!options.approved) {
    blockers.push("book id is not in the explicit approved-book-id list");
  }
  return blockers;
}

function notesDetailSummary(
  detail: NotesPageParse | null,
  alreadyFullyVisible: boolean,
  identity: DetailIdentity,
) {
  if (!detail) return null;
  return {
    noteCount: detail.noteCount,
    visibleNoteCount: detail.visibleNoteCount,
    hiddenNoteCount: detail.hiddenNoteCount,
    notePersistEndpointCount: detail.notePersistEndpointCount,
    spoilerToggleCount: detail.spoilerToggleCount,
    shelfGateDetected: detail.shelfGateDetected,
    alreadyFullyVisible,
    identity,
  };
}

// eslint-disable-next-line complexity -- one plan reports independent identity, route, approval, and visibility evidence gates.
export async function buildNotesPublicizeWorkflowPlan(options: NotesPublicizeWorkflowOptions) {
  const bookId = options.bookId.trim();
  if (!bookId) throw new Error("bookId is required");
  const detail = await loadNotesDetail(options.detailFixture);
  const identity = notesDetailIdentity(detail, bookId);
  const matchingLink = matchingNotesLink(detail, bookId);
  const verifyBookSlug = options.bookSlug?.trim() || matchingLink?.bookSlug || undefined;
  const verifyUserSlug = options.userSlug?.trim() || matchingLink?.userSlug || undefined;
  const routeResolvable = Boolean(verifyBookSlug && verifyUserSlug);
  const approved = Boolean(options.approvedBookIds?.includes(bookId));
  const alreadyFullyVisible = identity.matched && isFullyVisible(detail);
  const blockers = workflowBlockers({ detail, approved, identity, routeResolvable });
  const confidence = identity.conflicting
    ? "low"
    : routeResolvable && identity.matched
      ? "high"
      : "medium";

  return {
    bookId,
    bookSlug: verifyBookSlug ?? null,
    userSlug: verifyUserSlug ?? null,
    route: `/notes/${bookId}/share`,
    method: "PUT",
    verifyRouteTemplate: "/notes/{book_slug}/{user_slug}",
    verifyRoute:
      verifyBookSlug && verifyUserSlug
        ? notesVerifyRoute({ bookSlug: verifyBookSlug, userSlug: verifyUserSlug })
        : null,
    verifyBookSlugKnown: Boolean(verifyBookSlug),
    verifyUserSlugKnown: Boolean(verifyUserSlug),
    routeResolvable,
    dryRun: true,
    approved,
    confidence,
    evidence: {
      detailFixtureLoaded: Boolean(detail),
      requestedBookIdentityMatched: identity.matched,
      conflictingBookIdentityObserved: identity.conflicting,
      observedBookLinkCount: identity.observedBookLinkCount,
    },
    detail: notesDetailSummary(detail, alreadyFullyVisible, identity),
    action: identity.conflicting
      ? "blocked-identity-mismatch"
      : alreadyFullyVisible
        ? "noop-already-public"
        : "publicize-notes",
    blockers,
    workflowSteps: [
      "load notes detail page",
      "prove the requested book identity before deriving verification metadata",
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
