// Goodreads engine — the single source of truth shared by BOTH the CLI
// (cli/src/commands/*) and the MCP server (mcp/src/server.ts).
//
// Every operation returns a CommandEnvelope so the two surfaces emit an
// identical shape: the CLI prints it, the MCP wraps it as a tool result. This
// is what guarantees CLI<->MCP parity — neither surface re-implements logic,
// so they cannot drift. The CAPABILITIES registry below is the contract the
// parity test enforces.
import { readdir } from "node:fs/promises";
import { fetchAuthenticatedText, fetchPublicText, fetchText, goodreadsUrl } from "./client/http.js";
import {
  buildLiveRequestPlan,
  executeLiveRequest,
  type LiveExecuteOptions,
} from "./client/live.js";
import {
  envelope,
  loadApiMapRoutes,
  loadBrowserRoutes,
  loadSearchableApiEntries,
  parseCsv,
  planBookshelfMove,
  planNotesPublicize,
  readText,
  searchApiRoutes,
  summarizeBrowserRoutes,
  type GoodreadsRoute,
} from "./lib.js";
import { parseBookPage } from "./parsers/bookPage.js";
import {
  parseAuthorPage,
  parseRecommendationsPage,
  parseSearchResultsPage,
} from "./parsers/discoveryPage.js";
import { parseYearInBooksPage } from "./parsers/yearInBooksPage.js";
import { parseCommentsPage } from "./parsers/commentsPage.js";
import { parseMessagePage } from "./parsers/messagePage.js";
import { parseNotesPage, redactNotesPrivateIdentifiers } from "./parsers/notesPage.js";
import { parseNotesBooksPayload } from "./parsers/notesBooks.js";
import { parseShelfHtml } from "./parsers/shelfHtml.js";
import { emitLiveMutationWarning, riskLevelForRoute, type RiskLevel } from "./risk.js";
import {
  readShelfPagesFromFixtureDir,
  shelfSlugFromFixtureFilename,
  summarizeShelfPages,
} from "./shelf.js";
import type { CommandEnvelope, ShelfBookRow } from "./types/index.js";
import { parseShelfRss } from "./parsers/rss.js";
import {
  buildNotesPublicizeWorkflowPlan,
  buildRecentReadingList,
  buildRecentReadingNotes,
  buildRecentReadingPublicizePlan,
  checkPublicizeApproval,
} from "./workflows/recentReading.js";
import { ls as _ls, ss as _ss, ru as _ru, rv as _rv } from "./workflows/libraryWrites.js";

export const ls = _ls;
export const ss = _ss;
export const ru = _ru;
export const rv = _rv;

const DEFAULT_BASE_URL = "https://www.goodreads.com";

export type Envelope = CommandEnvelope<unknown>;

// ---------------------------------------------------------------------------
// Capability registry — the parity contract.
// Each capability is exposed on BOTH surfaces (cli + mcpTool). A null `cli`
// marks an MCP-only helper. The parity test (cli/test/parity.test.ts) asserts
// every entry is actually wired on the surface(s) it claims.
// ---------------------------------------------------------------------------
export interface Capability {
  key: string;
  cli: string | null;
  mcpTool: string;
  readOnly: boolean;
  risk: RiskLevel;
}

export const CAPABILITIES: Capability[] = [
  {
    key: "api-map-routes",
    cli: "api-map routes",
    mcpTool: "goodreads_api_map_routes",
    readOnly: true,
    risk: "read",
  },
  {
    key: "api-map-search",
    cli: "api-map search",
    mcpTool: "goodreads_route_search",
    readOnly: true,
    risk: "read",
  },
  {
    key: "browser-routes",
    cli: "api-map browser-routes",
    mcpTool: "goodreads_browser_routes",
    readOnly: true,
    risk: "read",
  },
  {
    key: "shelves-discover",
    cli: "shelves discover",
    mcpTool: "goodreads_shelves_discover",
    readOnly: true,
    risk: "read",
  },
  {
    key: "books-list",
    cli: "books list",
    mcpTool: "goodreads_books_list",
    readOnly: true,
    risk: "read",
  },
  {
    key: "books-export",
    cli: "books export",
    mcpTool: "goodreads_books_export",
    readOnly: true,
    risk: "read",
  },
  {
    key: "book-show",
    cli: "book show",
    mcpTool: "goodreads_book_show",
    readOnly: true,
    risk: "read",
  },
  {
    key: "search-books",
    cli: "search books",
    mcpTool: "goodreads_search_books",
    readOnly: true,
    risk: "read",
  },
  {
    key: "recommendations-list",
    cli: "recommendations list",
    mcpTool: "goodreads_recommendations_list",
    readOnly: true,
    risk: "read",
  },
  {
    key: "author-show",
    cli: "author show",
    mcpTool: "goodreads_author_show",
    readOnly: true,
    risk: "read",
  },
  {
    key: "year-in-books",
    cli: "stats year-in-books",
    mcpTool: "goodreads_year_in_books",
    readOnly: true,
    risk: "read",
  },
  {
    key: "comments-list",
    cli: "comments list",
    mcpTool: "goodreads_comments_list",
    readOnly: true,
    risk: "read",
  },
  {
    key: "messages-folders",
    cli: "messages folders",
    mcpTool: "goodreads_messages_folders",
    readOnly: true,
    risk: "read",
  },
  {
    key: "messages-list",
    cli: "messages list",
    mcpTool: "goodreads_messages_list",
    readOnly: true,
    risk: "read",
  },
  {
    key: "annotations-list",
    cli: "annotations list",
    mcpTool: "goodreads_annotations_list",
    readOnly: true,
    risk: "read",
  },
  {
    key: "annotations-thoughts-plan",
    cli: "annotations thoughts-plan",
    mcpTool: "goodreads_annotations_thoughts_plan",
    readOnly: true,
    risk: "read",
  },
  {
    key: "notes-inspect",
    cli: "notes inspect",
    mcpTool: "goodreads_notes_inspect",
    readOnly: true,
    risk: "read",
  },
  {
    key: "notes-books",
    cli: "notes books",
    mcpTool: "goodreads_notes_books",
    readOnly: true,
    risk: "read",
  },
  {
    key: "notes-publicize-plan",
    cli: "notes publicize-plan",
    mcpTool: "goodreads_notes_publicize_plan",
    readOnly: true,
    risk: "read",
  },
  {
    key: "notes-publicize",
    cli: "notes publicize",
    mcpTool: "goodreads_notes_publicize",
    readOnly: false,
    risk: "write-mutate",
  },
  {
    key: "notes-hide",
    cli: "notes hide",
    mcpTool: "goodreads_notes_hide",
    readOnly: false,
    risk: "write-mutate",
  },
  {
    key: "quotes-add",
    cli: "quotes add",
    mcpTool: "goodreads_quotes_add",
    readOnly: false,
    risk: "write-mutate",
  },
  {
    key: "quotes-remove",
    cli: "quotes remove",
    mcpTool: "goodreads_quotes_remove",
    readOnly: false,
    risk: "write-mutate",
  },
  {
    key: "quotes-reorder",
    cli: "quotes reorder",
    mcpTool: "goodreads_quotes_reorder",
    readOnly: false,
    risk: "write-mutate",
  },
  {
    key: "shelf-add",
    cli: "shelves add",
    mcpTool: "goodreads_shelf_add",
    readOnly: false,
    risk: "write-mutate",
  },
  {
    key: "shelf-remove",
    cli: "shelves remove",
    mcpTool: "goodreads_shelf_remove",
    readOnly: false,
    risk: "write-mutate",
  },
  {
    key: "recent-reading-list",
    cli: "recent-reading list",
    mcpTool: "goodreads_recent_reading_list",
    readOnly: true,
    risk: "read",
  },
  {
    key: "recent-reading-notes",
    cli: "recent-reading notes",
    mcpTool: "goodreads_recent_reading_notes",
    readOnly: true,
    risk: "read",
  },
  {
    key: "recent-reading-publicize-plan",
    cli: "recent-reading publicize-plan",
    mcpTool: "goodreads_recent_reading_publicize_plan",
    readOnly: true,
    risk: "read",
  },
  {
    key: "recent-reading-publicize",
    cli: "recent-reading publicize",
    mcpTool: "goodreads_recent_reading_publicize",
    readOnly: false,
    risk: "write-mutate",
  },
  {
    key: "bookshelf-move-plan",
    cli: "write-plan books move",
    mcpTool: "goodreads_bookshelf_move_plan",
    readOnly: true,
    risk: "read",
  },
  {
    key: "write-plan-notes-publicize",
    cli: "write-plan notes publicize",
    mcpTool: "goodreads_write_plan_notes_publicize",
    readOnly: true,
    risk: "read",
  },
  {
    key: "request-plan",
    cli: "request plan",
    mcpTool: "goodreads_request_plan",
    readOnly: true,
    risk: "read",
  },
  {
    key: "request-execute",
    cli: "request execute",
    mcpTool: "goodreads_request_execute",
    readOnly: false,
    risk: "write-mutate",
  },
  {
    key: "library-show",
    cli: "library show",
    mcpTool: "goodreads_library_show",
    readOnly: true,
    risk: "read",
  },
  {
    key: "set-status",
    cli: "library set-status",
    mcpTool: "goodreads_library_set_status",
    readOnly: false,
    risk: "write-mutate",
  },
  {
    key: "rating-update",
    cli: "library rating",
    mcpTool: "goodreads_rating_update",
    readOnly: false,
    risk: "write-mutate",
  },
  {
    key: "review-upsert",
    cli: "library review",
    mcpTool: "goodreads_review_upsert",
    readOnly: false,
    risk: "write-mutate",
  },
  {
    key: "dynamic-inventory-guidance",
    cli: null,
    mcpTool: "goodreads_dynamic_inventory_guidance",
    readOnly: true,
    risk: "read",
  },
];

export function capabilityByKey(key: string): Capability | undefined {
  return CAPABILITIES.find((capability) => capability.key === key);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
export function parsePairs(values: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const value of values ?? []) {
    const index = value.indexOf("=");
    if (index <= 0) throw new Error(`expected name=value, got ${value}`);
    out[value.slice(0, index)] = value.slice(index + 1);
  }
  return out;
}

export function parseJsonInput(value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(
      `body JSON must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function findRoute(selector: string): Promise<GoodreadsRoute> {
  const routes = await loadApiMapRoutes();
  const matches = routes.filter(
    (candidate) =>
      candidate.id === selector ||
      candidate.path === selector ||
      `${candidate.method} ${candidate.path}` === selector,
  );
  if (matches.length === 0) throw new Error(`unknown Goodreads route: ${selector}`);
  if (matches.length > 1) {
    const choices = matches.map((route) => `${route.method} ${route.path}`).join(", ");
    throw new Error(`ambiguous Goodreads route '${selector}'; use one of: ${choices}`);
  }
  return matches[0]!;
}

async function routeBySelector(selector: string): Promise<GoodreadsRoute> {
  const route = (await loadApiMapRoutes()).find(
    (candidate) => `${candidate.method} ${candidate.path}` === selector,
  );
  if (!route) throw new Error(`${selector} is missing from the api-map`);
  return route;
}

async function runWrite(
  route: GoodreadsRoute,
  options: LiveExecuteOptions,
  execute: boolean,
  verificationRequired: string,
): Promise<Envelope> {
  if (!execute) {
    return envelope(
      {
        ...buildLiveRequestPlan(route, { ...options, execute: false, dryRun: true }),
        riskLevel: riskLevelForRoute(route),
        submitted: false,
      },
      { warnings: ["dry-run: pass --execute to send this live write"], confidence: "high" },
    );
  }
  emitLiveMutationWarning(route);
  const result = await executeLiveRequest(route, { ...options, execute: true, dryRun: false });
  return envelope({
    submitted: "requestAccepted" in result ? result.requestAccepted : false,
    result,
    verificationRequired,
  });
}

// ---------------------------------------------------------------------------
// API map
// ---------------------------------------------------------------------------
export async function apiMapRoutes(
  options: { query?: string; method?: string; mutationsOnly?: boolean; limit?: number } = {},
): Promise<Envelope> {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  let routes = options.query
    ? searchApiRoutes(
        await loadSearchableApiEntries(),
        options.query,
        Number.isFinite(limit) ? limit : 200,
      )
    : await loadApiMapRoutes();
  if (options.method) routes = routes.filter((route) => route.method === options.method);
  if (options.mutationsOnly) routes = routes.filter((route) => route.mutatesAccount);
  const sliced = Number.isFinite(limit) ? routes.slice(0, limit) : routes;
  return envelope({ routeCount: sliced.length, routes: sliced });
}

export async function apiMapSearch(options: { query: string; limit?: number }): Promise<Envelope> {
  const routes = searchApiRoutes(
    await loadSearchableApiEntries(),
    options.query,
    options.limit ?? 20,
  );
  return envelope(
    { query: options.query, routeCount: routes.length, routes },
    { confidence: routes.length > 0 ? "high" : "low" },
  );
}

export async function browserRoutes(options: { summary?: boolean } = {}): Promise<Envelope> {
  const routes = await loadBrowserRoutes();
  return envelope(
    options.summary ? summarizeBrowserRoutes(routes) : { routeCount: routes.length, routes },
  );
}

// ---------------------------------------------------------------------------
// Shelves + books
// ---------------------------------------------------------------------------
export async function shelvesDiscover(options: {
  fixture?: string;
  user?: string;
  baseUrl?: string;
}): Promise<Envelope> {
  if (!options.fixture && !options.user) {
    throw new Error("user is required unless a fixture is supplied");
  }
  let html: string;
  const warnings: string[] = [];
  if (options.fixture) {
    html = await readText(options.fixture);
  } else {
    const url = goodreadsUrl(`/review/list/${options.user}`, options.baseUrl ?? DEFAULT_BASE_URL);
    const result = await fetchAuthenticatedText(url);
    html = result.html;
    if (result.signedOut) {
      warnings.push(
        "GOODREADS_COOKIE is set but the page returned the Goodreads sign-in wall. " +
          "The cookie may be expired or the session was terminated. " +
          "Re-extract GOODREADS_COOKIE from a logged-in browser.",
      );
    } else if (!process.env.GOODREADS_COOKIE) {
      warnings.push(
        "GOODREADS_COOKIE is not set. Shelf discovery may return the public sign-in page " +
          "instead of authenticated shelf inventory. Set GOODREADS_COOKIE for live shelf reads.",
      );
    }
  }
  const parsed = parseShelfHtml(html);
  if (parsed.shelfInventory.length === 0) {
    warnings.push(
      "No shelf inventory was discovered. The page may be private, logged out, or structurally changed.",
    );
  }
  return envelope(
    {
      shelves: parsed.shelfInventory,
      page: { title: parsed.title, declaredBookCount: parsed.declaredBookCount },
    },
    { warnings, confidence: parsed.shelfInventory.length > 0 ? "high" : "low" },
  );
}

export async function booksList(options: {
  shelf: string;
  fixtureDir?: string;
  source?: "html" | "rss";
  user?: string;
  baseUrl?: string;
}): Promise<Envelope> {
  const shelf = options.shelf;
  const requestedSource = options.source as string | undefined;
  if (requestedSource !== undefined && requestedSource !== "html" && requestedSource !== "rss") {
    throw new Error(`source must be one of html, rss (got ${requestedSource})`);
  }
  const source = requestedSource ?? (options.fixtureDir ? "html" : "rss");

  if (source === "html") {
    if (options.fixtureDir) {
      return booksListFromFixtures(options.fixtureDir, shelf);
    }
    if (!options.user) {
      throw new Error("fixture-dir or user is required when source is html");
    }
    return booksListLiveHtml(shelf, options.user, options.baseUrl);
  }

  if (!options.user) throw new Error("user is required when source is rss");
  const xml = await fetchText(
    goodreadsUrl(
      `/review/list_rss/${options.user}?shelf=${encodeURIComponent(shelf)}`,
      options.baseUrl ?? DEFAULT_BASE_URL,
    ),
  );
  const rss = parseShelfRss(xml);
  const warnings = rss.signals.rssMayCapAt100
    ? ["RSS returned exactly 100 items; this may be capped."]
    : [];
  return envelope(
    { shelf, source, rss },
    { warnings, confidence: rss.signals.rssMayCapAt100 ? "medium" : "high" },
  );
}

async function booksListFromFixtures(fixtureDir: string, shelf: string): Promise<Envelope> {
  const pages = await readShelfPagesFromFixtureDir(fixtureDir, shelf);
  if (pages.length === 0)
    throw new Error(`No shelf fixtures found for '${shelf}' in ${fixtureDir}`);
  const data = summarizeShelfPages(pages);
  return envelope(
    { shelf, source: "html" as const, ...data },
    { warnings: data.pagination.complete ? [] : ["Shelf export is incomplete."] },
  );
}

async function booksListLiveHtml(shelf: string, user: string, baseUrl?: string): Promise<Envelope> {
  const url = goodreadsUrl(
    `/review/list/${user}?shelf=${encodeURIComponent(shelf)}&per_page=100`,
    baseUrl ?? DEFAULT_BASE_URL,
  );
  const { html, signedOut } = await fetchAuthenticatedText(url);
  const parsed = parseShelfHtml(html);
  const data = summarizeShelfPages([parsed]);
  const warnings: string[] = [];
  if (signedOut) {
    warnings.push(
      "GOODREADS_COOKIE is set but the page returned the Goodreads sign-in wall. " +
        "The cookie may be expired or the session was terminated.",
    );
  }
  if (!data.pagination.complete) {
    warnings.push(
      "Live HTML fetches a single page (per_page=100). " +
        "The shelf may contain more books than this page shows. " +
        `Declared count: ${parsed.declaredBookCount ?? "unknown"}, ` +
        `parsed this page: ${parsed.rows.length}. ` +
        "Use pageLinks or per_page in follow-up calls to page through results.",
    );
  }
  if (data.rows.length === 100) {
    warnings.push(
      "This page returned exactly 100 rows — the shelf likely has more books. " +
        "Use per_page=100 and pagination links for additional pages.",
    );
  }
  return envelope(
    { shelf, source: "html" as const, ...data, signedOut },
    { warnings, confidence: signedOut ? "low" : data.rows.length > 0 ? "high" : "medium" },
  );
}

export async function booksExport(options: {
  fixtureDir: string;
  shelves?: string;
}): Promise<Envelope> {
  const dir = options.fixtureDir;
  if (!dir) throw new Error("a fixture directory is required for books export");
  let shelves = parseCsv(options.shelves);
  if (shelves.length === 0) {
    const files = await readdir(dir);
    shelves = [
      ...new Set(
        files.map(shelfSlugFromFixtureFilename).filter((value): value is string => Boolean(value)),
      ),
    ];
  }

  const perShelf = [];
  const booksById = new Map<string, ShelfBookRow & { shelves: string[] }>();
  const warnings: string[] = [];

  for (const shelf of shelves) {
    const pages = await readShelfPagesFromFixtureDir(dir, shelf);
    if (pages.length === 0) {
      warnings.push(`No shelf fixtures found for '${shelf}'.`);
      continue;
    }
    const result = summarizeShelfPages(pages);
    perShelf.push({ shelf, pagination: result.pagination });
    if (!result.pagination.complete) warnings.push(`Shelf '${shelf}' is incomplete.`);
    for (const row of result.rows) {
      const key = row.bookId ?? row.reviewId ?? row.bookHref ?? row.title;
      if (!key) continue;
      const existing = booksById.get(key);
      if (existing) existing.shelves.push(shelf);
      else booksById.set(key, { ...row, shelves: [shelf] });
    }
  }

  return envelope(
    { shelves, perShelf, books: [...booksById.values()] },
    { warnings, confidence: warnings.length === 0 ? "high" : "medium" },
  );
}

export async function bookShow(options: {
  slugOrId?: string;
  fixture?: string;
  baseUrl?: string;
}): Promise<Envelope> {
  const hasSlugOrId = Boolean(options.slugOrId?.trim());
  const hasFixture = Boolean(options.fixture?.trim());
  if (hasSlugOrId === hasFixture) {
    throw new Error("exactly one of slugOrId or fixture is required");
  }
  const html = options.fixture
    ? await readText(options.fixture)
    : await fetchText(
        goodreadsUrl(`/book/show/${options.slugOrId}`, options.baseUrl ?? DEFAULT_BASE_URL),
      );
  const parsed = parseBookPage(html);
  return envelope(parsed, { confidence: parsed.jsonLdBook.name ? "high" : "medium" });
}

function discoveryWarnings(html: string, signedOut: boolean, requiresAuth: boolean): string[] {
  const sample = html.slice(0, 64_000).toLowerCase();
  const warnings: string[] = [];
  if (/captcha|robot check|automated access|not a robot/.test(sample)) {
    warnings.push("Goodreads returned an anti-bot challenge instead of discovery results.");
  }
  if (requiresAuth && (!process.env.GOODREADS_COOKIE || signedOut)) {
    warnings.push(
      "Personalized recommendations require a current GOODREADS_COOKIE; Goodreads returned no authenticated recommendation session.",
    );
  }
  return warnings;
}

export async function searchBooks(options: {
  query: string;
  limit?: number;
  baseUrl?: string;
}): Promise<Envelope> {
  const query = options.query.trim();
  if (!query) throw new Error("query is required");
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer from 1 through 100");
  }
  // Public search must not send Amazon SSO cookies (at-main/session-token/…).
  // Those keep writes signed-in but 302-loop /search under undici follow.
  const html = await fetchPublicText(
    goodreadsUrl(
      `/search?q=${encodeURIComponent(query)}&search_type=books`,
      options.baseUrl ?? DEFAULT_BASE_URL,
    ),
  );
  const parsed = parseSearchResultsPage(html);
  const warnings = discoveryWarnings(html, false, false);
  if (parsed.books.length === 0 && warnings.length === 0) {
    warnings.push(
      "No book candidates were parsed; the page may have changed or have no matching books.",
    );
  }
  return envelope(
    { ...parsed, query, totalAvailable: parsed.books.length, books: parsed.books.slice(0, limit) },
    { warnings, confidence: parsed.books.length > 0 && warnings.length === 0 ? "high" : "low" },
  );
}

export async function recommendationsList(
  options: {
    limit?: number;
    baseUrl?: string;
  } = {},
): Promise<Envelope> {
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer from 1 through 100");
  }
  const { html, signedOut } = await fetchAuthenticatedText(
    goodreadsUrl("/recommendations", options.baseUrl ?? DEFAULT_BASE_URL),
  );
  const parsed = parseRecommendationsPage(html);
  const warnings = discoveryWarnings(html, signedOut, true);
  if (parsed.books.length === 0 && warnings.length === 0) {
    warnings.push("No recommendation cards were parsed; the page may have changed.");
  }
  return envelope(
    { ...parsed, totalAvailable: parsed.books.length, books: parsed.books.slice(0, limit) },
    { warnings, confidence: parsed.books.length > 0 && warnings.length === 0 ? "high" : "low" },
  );
}

export async function authorShow(options: {
  authorSlug: string;
  limit?: number;
  baseUrl?: string;
}): Promise<Envelope> {
  const authorSlug = options.authorSlug.trim();
  if (!authorSlug) throw new Error("author-slug is required");
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer from 1 through 100");
  }
  const { html, signedOut } = await fetchAuthenticatedText(
    goodreadsUrl(
      `/author/show/${encodeURIComponent(authorSlug)}`,
      options.baseUrl ?? DEFAULT_BASE_URL,
    ),
  );
  const parsed = parseAuthorPage(html);
  const warnings = discoveryWarnings(html, signedOut, false);
  if (!parsed.name && warnings.length === 0) {
    warnings.push("No author identity was parsed; the page may have changed or be unavailable.");
  }
  return envelope(
    { ...parsed, totalAvailable: parsed.books.length, books: parsed.books.slice(0, limit) },
    { warnings, confidence: parsed.name && warnings.length === 0 ? "high" : "low" },
  );
}

export async function yearInBooks(options: {
  userId: string;
  year: number;
  fixture?: string;
  baseUrl?: string;
}): Promise<Envelope> {
  const userId = options.userId.trim();
  if (!userId) throw new Error("user-id is required");
  if (!Number.isInteger(options.year) || options.year < 2000 || options.year > 2100) {
    throw new Error("year must be an integer from 2000 through 2100");
  }
  const html = options.fixture
    ? await readText(options.fixture)
    : await fetchText(
        goodreadsUrl(
          `/user/year_in_books/${options.year}/${encodeURIComponent(userId)}`,
          options.baseUrl ?? DEFAULT_BASE_URL,
        ),
      );
  const sample = html.slice(0, 64_000).toLowerCase();
  const parsed = parseYearInBooksPage(html, { userId, year: options.year });
  const complete = parsed.booksRead !== null && parsed.pagesRead !== null;
  const signedOut =
    !complete &&
    /sign in to goodreads|name=["']sign_in|\/user\/sign_in|amazon sign-in/.test(sample);
  const challenge = /captcha|robot check|automated access|not a robot/.test(sample);
  const warnings: string[] = [];
  if (signedOut) warnings.push("Goodreads returned a sign-in page instead of Year in Books data.");
  if (challenge)
    warnings.push("Goodreads returned an anti-bot challenge instead of Year in Books data.");
  if (!complete && !signedOut && !challenge) {
    warnings.push(
      "Year in Books summary markers were missing; the page may have changed or be unavailable.",
    );
  }
  return envelope(
    { ...parsed, signedOut, challenge },
    { warnings, confidence: complete && !signedOut && !challenge ? "high" : "low" },
  );
}

// ---------------------------------------------------------------------------
// Comments + messages
// ---------------------------------------------------------------------------
export async function commentsList(options: {
  userSlug?: string;
  fixture?: string;
}): Promise<Envelope> {
  if (!options.fixture && !options.userSlug) {
    throw new Error("user-slug is required unless a fixture is supplied");
  }
  const parsed = options.fixture ? parseCommentsPage(await readText(options.fixture)) : null;
  return envelope(
    {
      routeTemplate: "/comment/list/{user_slug}",
      route: options.userSlug ? `/comment/list/${options.userSlug}` : null,
      parsed,
      writeBoundary:
        "Comment writes are not part of notes/highlights visibility and remain disabled until separately captured and approved.",
    },
    { confidence: parsed ? "high" : "medium" },
  );
}

export async function messagesFolders(options: { fixture?: string } = {}): Promise<Envelope> {
  if (options.fixture) {
    const parsed = parseMessagePage(await readText(options.fixture));
    const warnings =
      parsed.folders.length > 0
        ? []
        : [
            "No message folders were discovered in the fixture; the page may be logged out or structurally changed.",
          ];
    return envelope(
      {
        folders: parsed.folders,
        page: { title: parsed.title },
      },
      {
        warnings,
        confidence: parsed.folders.length > 0 ? "high" : "low",
      },
    );
  }

  return envelope(
    {
      folders: [
        { slug: "inbox", href: "/message/inbox" },
        { slug: "saved", href: "/message/saved" },
        { slug: "sent", href: "/message/sent" },
        { slug: "trash", href: "/message/trash" },
      ],
    },
    {
      warnings: [
        "Using mapped default folders; pass a fixture to discover them from the current account UI.",
      ],
      confidence: "medium",
    },
  );
}

export async function messagesList(options: { fixture: string }): Promise<Envelope> {
  const parsed = parseMessagePage(await readText(options.fixture));
  return envelope(parsed, { confidence: parsed.messageLinks.length > 0 ? "high" : "medium" });
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------
export async function annotationsList(options: {
  fixture: string;
  bookId?: string;
  userSlug?: string;
  includePrivateIds?: boolean;
}): Promise<Envelope> {
  const parsed = parseNotesPage(await readText(options.fixture));
  const annotations = parsed.notes.map((note, index) => ({
    ref: `annotation-${index + 1}`,
    annotationPairId: options.includePrivateIds
      ? note.annotationPairId
      : note.annotationPairId
        ? "<redacted>"
        : null,
    hasAnnotationPairId: Boolean(note.annotationPairId),
    visible: note.visible,
    hasNotePersistEndpoint: Boolean(note.notePersistEndpoint),
    hasSpoilerToggle: note.hasSpoilerToggle,
  }));
  return envelope(
    {
      bookId: options.bookId ?? null,
      userSlug: options.userSlug ?? null,
      annotationCount: annotations.length,
      annotations,
      thoughtsWrite: {
        routeTemplate: "/notes/{book_id}/{annotation_pair_id}/note",
        status: "plan-only-until-approved-capture",
      },
    },
    {
      warnings: options.includePrivateIds
        ? [
            "Raw annotation pair ids emitted for private local use; do not put this output in shareable proofs.",
          ]
        : [],
      confidence: annotations.length > 0 ? "high" : "medium",
    },
  );
}

export function annotationsThoughtsPlan(options: {
  bookId: string;
  annotationPairId: string;
}): Envelope {
  return envelope({
    dryRun: true,
    mutatesAccount: true,
    method: "POST",
    route: `/notes/${options.bookId}/${options.annotationPairId}/note`,
    routeTemplate: "/notes/{book_id}/{annotation_pair_id}/note",
    form: {
      authenticity_token: "<from-current-page>",
      note: "<user-supplied-thought>",
    },
    warning:
      "Execution is disabled until an approved capture proves payload, CSRF requirements, and reload verification.",
  });
}

// ---------------------------------------------------------------------------
// Notes — inspect + publicize/hide
// ---------------------------------------------------------------------------
async function notesShareRoute(): Promise<GoodreadsRoute> {
  return routeBySelector("PUT /notes/{book_id}/share");
}

export async function notesInspect(options: {
  fixture: string;
  includePrivateIds?: boolean;
}): Promise<Envelope> {
  const parsed = parseNotesPage(await readText(options.fixture));
  const output = options.includePrivateIds ? parsed : redactNotesPrivateIdentifiers(parsed);
  return envelope(output, {
    warnings: options.includePrivateIds
      ? [
          "Raw annotation pair ids and note persistence endpoints emitted for private local use; do not share this output.",
        ]
      : [],
    confidence: parsed.noteCount > 0 || parsed.noteBookLinks.length > 0 ? "high" : "medium",
  });
}

export async function notesBooks(options: {
  userId: string;
  limit?: number;
  baseUrl?: string;
}): Promise<Envelope> {
  const userId = options.userId.trim();
  if (!/^\d+$/.test(userId)) throw new Error("user-id must be numeric");
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("limit must be an integer from 1 through 500");
  }
  const raw = await fetchText(
    goodreadsUrl(
      `/notes/${encodeURIComponent(userId)}/load_more`,
      options.baseUrl ?? DEFAULT_BASE_URL,
    ),
  );
  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    return envelope(
      { kind: "notes_books", bookCount: 0, books: [], nextTokenPresent: false },
      {
        warnings: ["Goodreads returned non-JSON content instead of annotated-book metadata."],
        confidence: "low",
      },
    );
  }
  const parsed = parseNotesBooksPayload(payload);
  return envelope(
    {
      ...parsed,
      totalAvailable: parsed.bookCount,
      returnedCount: Math.min(limit, parsed.bookCount),
      books: parsed.books.slice(0, limit),
    },
    { confidence: parsed.bookCount > 0 ? "high" : "medium" },
  );
}

export async function notesPublicizePlan(options: {
  bookId: string;
  bookSlug?: string;
  userSlug?: string;
  detailFixture?: string;
  approvedBookIds?: string[];
}): Promise<Envelope> {
  const plan = await buildNotesPublicizeWorkflowPlan({
    bookId: options.bookId,
    bookSlug: options.bookSlug,
    userSlug: options.userSlug,
    detailFixture: options.detailFixture,
    approvedBookIds: options.approvedBookIds ?? [],
  });
  return envelope(plan, {
    warnings: plan.blockers,
    confidence: options.detailFixture ? "high" : "medium",
  });
}

async function notesShareWrite(
  options: { bookId: string; approvedBookIds?: string[]; execute?: boolean; dryRun?: boolean },
  visible: "true" | "false",
  verificationRequired: string,
): Promise<Envelope> {
  const route = await notesShareRoute();
  const approval = checkPublicizeApproval({
    bookId: options.bookId,
    approvedBookIds: options.approvedBookIds ?? [],
    execute: Boolean(options.execute),
  });
  const blocked = !options.execute || options.dryRun || approval.blockers.length > 0;
  const requestPlan = buildLiveRequestPlan(route, {
    pathParams: { book_id: options.bookId },
    form: { visible },
    execute: !blocked,
    dryRun: blocked,
  });
  if (blocked) {
    return envelope(
      { approval, requestPlan, submitted: false },
      { warnings: approval.blockers, confidence: "high" },
    );
  }
  emitLiveMutationWarning(route);
  const result = await executeLiveRequest(route, {
    pathParams: { book_id: options.bookId },
    form: { visible },
    execute: true,
    dryRun: false,
  });
  return envelope({
    approval,
    submitted: "requestAccepted" in result ? result.requestAccepted : false,
    result,
    verificationRequired,
  });
}

export function notesPublicize(options: {
  bookId: string;
  approvedBookIds?: string[];
  execute?: boolean;
  dryRun?: boolean;
}): Promise<Envelope> {
  return notesShareWrite(
    options,
    "true",
    "Reload the notes detail page and verify visible count equals total note count before claiming success.",
  );
}

export function notesHide(options: {
  bookId: string;
  approvedBookIds?: string[];
  execute?: boolean;
  dryRun?: boolean;
}): Promise<Envelope> {
  return notesShareWrite(
    options,
    "false",
    "Reload the notes detail page and verify visible count equals zero before claiming success.",
  );
}

// ---------------------------------------------------------------------------
// Quotes (writes default to dry-run)
// ---------------------------------------------------------------------------
export async function quotesAdd(options: {
  body: string;
  author: string;
  title?: string;
  tags?: string;
  execute?: boolean;
}): Promise<Envelope> {
  const route = await routeBySelector("POST /quotes");
  const form: Record<string, string> = {
    "quote[body]": options.body,
    "quote[author_name]": options.author,
  };
  if (options.title) form["quote[title]"] = options.title;
  if (options.tags) form["quote[tags]"] = options.tags;
  return runWrite(
    route,
    { form },
    Boolean(options.execute),
    "Reload /quotes/list and confirm the new quote appears.",
  );
}

export async function quotesRemove(options: {
  quoteSlug: string;
  execute?: boolean;
}): Promise<Envelope> {
  const route = await routeBySelector("POST /quotes/{quote_slug}/remove");
  return runWrite(
    route,
    { pathParams: { quote_slug: options.quoteSlug }, query: { return_url: "/quotes/list" } },
    Boolean(options.execute),
    "Reload /quotes/list and confirm the quote is gone.",
  );
}

const QUOTE_MOVE_ROUTES = {
  up: "POST /quotes/move_up/{quote_id}",
  down: "POST /quotes/move_down/{quote_id}",
  top: "POST /quotes/move_top/{quote_id}",
  bottom: "POST /quotes/move_bottom/{quote_id}",
} as const;

export type QuoteMoveDirection = keyof typeof QUOTE_MOVE_ROUTES;

export async function quotesReorder(options: {
  quoteId: string;
  direction: string;
  execute?: boolean;
}): Promise<Envelope> {
  const direction = options.direction.toLowerCase() as QuoteMoveDirection;
  if (!(direction in QUOTE_MOVE_ROUTES)) {
    throw new Error(`direction must be one of up, down, top, bottom (got ${options.direction})`);
  }
  const route = await routeBySelector(QUOTE_MOVE_ROUTES[direction]);
  return runWrite(
    route,
    { pathParams: { quote_id: options.quoteId } },
    Boolean(options.execute),
    "Reload /quotes/list and confirm the new ordering.",
  );
}

// ---------------------------------------------------------------------------
// Shelf add / remove
// ---------------------------------------------------------------------------
const SHELF_ADD_ROUTE = "POST /shelf/add_to_shelf";

export async function shelfAdd(options: {
  bookId: string;
  shelf: string;
  execute?: boolean;
}): Promise<Envelope> {
  const route = await routeBySelector(SHELF_ADD_ROUTE);
  return runWrite(
    route,
    { form: { book_id: options.bookId, name: options.shelf } },
    Boolean(options.execute),
    `Reload shelf "${options.shelf}" and confirm book ${options.bookId} is listed.`,
  );
}

export async function shelfRemove(options: {
  bookId: string;
  shelf: string;
  execute?: boolean;
}): Promise<Envelope> {
  const route = await routeBySelector(SHELF_ADD_ROUTE);
  return runWrite(
    route,
    { form: { book_id: options.bookId, name: options.shelf, a: "remove" } },
    Boolean(options.execute),
    `Reload shelf "${options.shelf}" and confirm book ${options.bookId} is gone.`,
  );
}

// ---------------------------------------------------------------------------
// Recent reading
// ---------------------------------------------------------------------------
export async function recentReadingList(options: {
  fixtureDir: string;
  shelves: string[];
  limit: number;
}): Promise<Envelope> {
  const data = await buildRecentReadingList(options);
  return envelope(data, {
    warnings: data.warnings,
    confidence: data.warnings.length === 0 ? "high" : "medium",
  });
}

export async function recentReadingNotes(options: {
  fixtureDir: string;
  notesIndexFixture?: string;
  shelves: string[];
  limit: number;
}): Promise<Envelope> {
  const data = await buildRecentReadingNotes(options);
  return envelope(data, {
    warnings: data.warnings,
    confidence: data.notesIndex ? "high" : "medium",
  });
}

export async function recentReadingPublicizePlan(options: {
  fixtureDir: string;
  notesIndexFixture?: string;
  shelves: string[];
  limit: number;
  approvedBookIds: string[];
}): Promise<Envelope> {
  const data = await buildRecentReadingPublicizePlan(options);
  return envelope(data, {
    warnings: data.warnings,
    confidence: data.notesIndex ? "high" : "medium",
  });
}

export function recentReadingPublicize(options: {
  bookId: string;
  approvedBookIds?: string[];
  execute?: boolean;
  dryRun?: boolean;
}): Promise<Envelope> {
  return notesShareWrite(
    options,
    "true",
    "Reload the notes detail page and verify visible count equals total note count before claiming success.",
  );
}

// ---------------------------------------------------------------------------
// Static write plans
// ---------------------------------------------------------------------------
export function bookshelfMovePlan(options: {
  reviewId: string;
  toShelf: string;
  user: string;
}): Envelope {
  return envelope(planBookshelfMove(options));
}

export function writePlanNotesPublicize(options: {
  bookId: string;
  bookSlug?: string;
  userSlug?: string;
}): Envelope {
  return envelope(planNotesPublicize(options));
}

// ---------------------------------------------------------------------------
// Raw request plan / execute
// ---------------------------------------------------------------------------
export async function requestPlan(options: {
  routeSelector: string;
  baseUrl?: string;
  pathParams?: Record<string, string>;
  query?: Record<string, string>;
  bodyJson?: unknown;
  form?: Record<string, string>;
  authenticated?: boolean;
}): Promise<Envelope> {
  const route = await findRoute(options.routeSelector);
  const plan = buildLiveRequestPlan(route, {
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
    pathParams: options.pathParams ?? {},
    query: options.query ?? {},
    bodyJson: options.bodyJson,
    form: options.form ?? {},
    authenticated: options.authenticated,
    dryRun: true,
  });
  return envelope({ ...plan, riskLevel: riskLevelForRoute(route) });
}

export async function requestExecute(options: {
  routeSelector: string;
  baseUrl?: string;
  pathParams?: Record<string, string>;
  query?: Record<string, string>;
  bodyJson?: unknown;
  form?: Record<string, string>;
  authenticated?: boolean;
  approvedRoute?: string;
  execute?: boolean;
  dryRun?: boolean;
}): Promise<Envelope> {
  const route = await findRoute(options.routeSelector);
  const executeOptions: LiveExecuteOptions = {
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
    pathParams: options.pathParams ?? {},
    query: options.query ?? {},
    bodyJson: options.bodyJson,
    form: options.form ?? {},
    authenticated: options.authenticated,
    execute: options.execute,
    dryRun: options.dryRun,
  };
  const plan = buildLiveRequestPlan(route, executeOptions);
  if (route.mutatesAccount && options.execute) {
    const exactRoute = `${route.method} ${route.path}`;
    if (process.env.GOODREADS_ALLOW_GENERIC_WRITES !== "1") {
      throw new Error("live generic mutations require GOODREADS_ALLOW_GENERIC_WRITES=1");
    }
    if (options.approvedRoute !== exactRoute && options.approvedRoute !== route.id) {
      throw new Error(
        `live mutation requires approvedRoute to exactly equal '${exactRoute}' or '${route.id}'`,
      );
    }
  }
  if (plan.dryRun) {
    return envelope({
      ...plan,
      riskLevel: riskLevelForRoute(route),
    });
  }
  emitLiveMutationWarning(route);
  return envelope(await executeLiveRequest(route, executeOptions));
}

// ---------------------------------------------------------------------------
// Guidance (MCP-only helper)
// ---------------------------------------------------------------------------
export function dynamicInventoryGuidance(): Envelope {
  return envelope({
    rule: "Discover current account/page inventory before acting.",
    dynamicSurfaces: [
      "custom shelves and shelf counts",
      "review/list pagination and private RSS caps",
      "message folders and batch forms",
      "notes/highlights book links, note ids, visibility state, and spoiler controls",
      "friends/following/profile/comments route anchors",
      "year-in-books and people discovery pages",
    ],
    writeBoundary:
      "Use plan tools by default. Do not submit notes, shelf, message, review, or account mutations without explicit approval for that exact route and current page.",
  });
}
