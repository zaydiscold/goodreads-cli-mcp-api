// Goodreads engine — the single source of truth shared by BOTH the CLI
// (cli/src/commands/*) and the MCP server (mcp/src/server.ts).
//
// Every operation returns a CommandEnvelope so the two surfaces emit an
// identical shape: the CLI prints it, the MCP wraps it as a tool result. This
// is what guarantees CLI<->MCP parity — neither surface re-implements logic,
// so they cannot drift. The CAPABILITIES registry below is the contract the
// parity test enforces.
import { fetchText, goodreadsUrl } from "./client/http.js";
import {
  buildLiveRequestPlan,
  executeLiveRequest,
  type LiveExecuteOptions,
} from "./client/live.js";
import {
  envelope,
  fileExists,
  loadApiMapRoutes,
  loadBrowserRoutes,
  parseCsv,
  planBookshelfMove,
  planNotesPublicize,
  readText,
  searchApiRoutes,
  summarizeBrowserRoutes,
  type GoodreadsRoute,
} from "./lib.js";
import { parseBookPage } from "./parsers/bookPage.js";
import { parseCommentsPage } from "./parsers/commentsPage.js";
import { parseMessagePage } from "./parsers/messagePage.js";
import { parseNotesPage } from "./parsers/notesPage.js";
import { parseShelfHtml } from "./parsers/shelfHtml.js";
import { emitLiveMutationWarning, riskLevelForRoute, type RiskLevel } from "./risk.js";
import { readShelfPagesFromFixtureDir, summarizeShelfPages } from "./shelf.js";
import type { CommandEnvelope, ShelfBookRow } from "./types/index.js";
import { parseShelfRss } from "./parsers/rss.js";
import {
  buildNotesPublicizeWorkflowPlan,
  buildRecentReadingList,
  buildRecentReadingNotes,
  buildRecentReadingPublicizePlan,
  checkPublicizeApproval,
} from "./workflows/recentReading.js";

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
  const route = routes.find(
    (candidate) =>
      candidate.id === selector ||
      candidate.path === selector ||
      `${candidate.method} ${candidate.path}` === selector,
  );
  if (!route) throw new Error(`unknown Goodreads route: ${selector}`);
  return route;
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
        ...buildLiveRequestPlan(route, { ...options, dryRun: true }),
        riskLevel: riskLevelForRoute(route),
        submitted: false,
      },
      { warnings: ["dry-run: pass --execute to send this live write"], confidence: "high" },
    );
  }
  emitLiveMutationWarning(route);
  const result = await executeLiveRequest(route, { ...options, dryRun: false });
  return envelope({ submitted: true, result, verificationRequired });
}

// ---------------------------------------------------------------------------
// API map
// ---------------------------------------------------------------------------
export async function apiMapRoutes(
  options: { query?: string; method?: string; mutationsOnly?: boolean; limit?: number } = {},
): Promise<Envelope> {
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  let routes = options.query
    ? searchApiRoutes(await loadApiMapRoutes(), options.query, Number.isFinite(limit) ? limit : 200)
    : await loadApiMapRoutes();
  if (options.method) routes = routes.filter((route) => route.method === options.method);
  if (options.mutationsOnly) routes = routes.filter((route) => route.mutatesAccount);
  const sliced = Number.isFinite(limit) ? routes.slice(0, limit) : routes;
  return envelope({ routeCount: sliced.length, routes: sliced });
}

export async function apiMapSearch(options: { query: string; limit?: number }): Promise<Envelope> {
  const routes = searchApiRoutes(await loadApiMapRoutes(), options.query, options.limit ?? 20);
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
  const html = options.fixture
    ? await readText(options.fixture)
    : await fetchText(
        goodreadsUrl(`/review/list/${options.user}`, options.baseUrl ?? DEFAULT_BASE_URL),
      );
  const parsed = parseShelfHtml(html);
  const warnings: string[] = [];
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
  if (options.fixtureDir) {
    const pages = await readShelfPagesFromFixtureDir(options.fixtureDir, shelf);
    if (pages.length === 0)
      throw new Error(`No shelf fixtures found for '${shelf}' in ${options.fixtureDir}`);
    const data = summarizeShelfPages(pages);
    return envelope(
      { shelf, ...data },
      { warnings: data.pagination.complete ? [] : ["Shelf export is incomplete."] },
    );
  }
  if (!options.user)
    throw new Error("user is required when listing books without a fixture directory");
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
    { shelf, rss },
    { warnings, confidence: rss.signals.rssMayCapAt100 ? "medium" : "high" },
  );
}

export async function booksExport(options: {
  fixtureDir: string;
  shelves?: string;
}): Promise<Envelope> {
  const dir = options.fixtureDir;
  if (!dir) throw new Error("a fixture directory is required for books export");
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  let shelves = parseCsv(options.shelves);
  if (shelves.length === 0) {
    const files = await readdir(dir);
    shelves = [
      ...new Set(
        files
          .map((file) => file.match(/^shelf-(.+?)(?:-page\d+)?\.html$/)?.[1])
          .filter((value): value is string => Boolean(value)),
      ),
    ];
  }

  const perShelf = [];
  const booksById = new Map<string, ShelfBookRow & { shelves: string[] }>();
  const warnings: string[] = [];

  for (const shelf of shelves) {
    const hasFirstPage = fileExists(join(dir, `shelf-${shelf}.html`));
    if (!hasFirstPage) {
      warnings.push(`Missing first-page fixture for shelf '${shelf}'.`);
      continue;
    }
    const pages = await readShelfPagesFromFixtureDir(dir, shelf);
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
  const html = options.fixture
    ? await readText(options.fixture)
    : await fetchText(
        goodreadsUrl(`/book/show/${options.slugOrId}`, options.baseUrl ?? DEFAULT_BASE_URL),
      );
  const parsed = parseBookPage(html);
  return envelope(parsed, { confidence: parsed.jsonLdBook.name ? "high" : "medium" });
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
  const warnings: string[] = [];
  if (options.fixture) {
    await readText(options.fixture);
  } else {
    warnings.push(
      "Using mapped default folders; pass a fixture to prove them from the current account UI.",
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
    { warnings, confidence: options.fixture ? "high" : "medium" },
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

export async function notesInspect(options: { fixture: string }): Promise<Envelope> {
  const parsed = parseNotesPage(await readText(options.fixture));
  return envelope(parsed, {
    confidence: parsed.noteCount > 0 || parsed.noteBookLinks.length > 0 ? "high" : "medium",
  });
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
    form: visible === "false" ? { visible: "false" } : undefined,
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
    dryRun: false,
  });
  return envelope({ approval, submitted: true, result, verificationRequired });
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
}): Promise<Envelope> {
  const route = await findRoute(options.routeSelector);
  const plan = buildLiveRequestPlan(route, {
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
    pathParams: options.pathParams ?? {},
    query: options.query ?? {},
    bodyJson: options.bodyJson,
    form: options.form ?? {},
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
  dryRun?: boolean;
}): Promise<Envelope> {
  const route = await findRoute(options.routeSelector);
  const executeOptions: LiveExecuteOptions = {
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
    pathParams: options.pathParams ?? {},
    query: options.query ?? {},
    bodyJson: options.bodyJson,
    form: options.form ?? {},
    dryRun: options.dryRun,
  };
  if (options.dryRun) {
    return envelope({
      ...buildLiveRequestPlan(route, executeOptions),
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
