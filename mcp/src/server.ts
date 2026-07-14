#!/usr/bin/env node
// Goodreads MCP server.
//
// Every tool is a thin adapter over the shared engine in
// `@zaydiscold/goodreads-cli/engine` — the SAME functions the CLI commands
// call. Neither surface re-implements logic, so the CLI and MCP cannot drift.
// The engine returns CommandEnvelopes; we serialize them verbatim, so a tool's
// JSON matches the CLI's `--json` output field-for-field. The CAPABILITIES
// registry in the engine is the contract; cli/test/parity.test.ts enforces
// that every capability is wired on both surfaces.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  annotationsList,
  annotationsThoughtsPlan,
  apiMapRoutes,
  apiMapSearch,
  bookShow,
  booksExport,
  booksList,
  bookshelfMovePlan,
  browserRoutes,
  commentsList,
  dynamicInventoryGuidance,
  messagesFolders,
  messagesList,
  notesHide,
  notesInspect,
  notesPublicize,
  notesPublicizePlan,
  parsePairs,
  quotesAdd,
  quotesRemove,
  quotesReorder,
  recentReadingList,
  recentReadingNotes,
  recentReadingPublicize,
  recentReadingPublicizePlan,
  requestExecute,
  requestPlan,
  shelvesDiscover,
  writePlanNotesPublicize,
  type Envelope,
} from "@zaydiscold/goodreads-cli/engine";
import type { RiskLevel } from "@zaydiscold/goodreads-cli/risk";
import { parseMcpProfile, toolsForProfile, type GoodreadsToolName } from "./profile.js";

const server = new McpServer({
  name: "goodreads-cli-mcp",
  version: "0.1.0",
});
const enabledTools = toolsForProfile(parseMcpProfile(process.env.GOODREADS_MCP_PROFILE));
const prettyOutput = process.env.GOODREADS_MCP_OUTPUT === "pretty";

type ToolConfig<Args extends z.ZodRawShape> = {
  title?: string;
  description?: string;
  inputSchema: Args;
  annotations?: ToolAnnotations;
  _meta?: Record<string, unknown>;
};

function registerTool<Args extends z.ZodRawShape>(
  name: GoodreadsToolName,
  config: ToolConfig<Args>,
  callback: ToolCallback<Args>,
): void {
  if (!enabledTools.has(name)) return;
  server.registerTool(name, config, callback);
}

function jsonResponse(value: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(value, null, prettyOutput ? 2 : undefined) },
    ],
  };
}

function emit(envelope: Envelope) {
  return jsonResponse(envelope);
}

function toolAnnotations(
  readOnly: boolean,
  risk: RiskLevel,
  openWorldHint = true,
): ToolAnnotations {
  return {
    readOnlyHint: readOnly,
    destructiveHint: risk === "write-destructive",
    idempotentHint: risk === "read" || risk === "write-safe",
    openWorldHint,
  };
}

// ---------------------------------------------------------------------------
// API map
// ---------------------------------------------------------------------------
registerTool(
  "goodreads_api_map_routes",
  {
    title: "Goodreads API Map Routes",
    description:
      "List bundled Goodreads web/RSS routes. This reads local api-map files and makes no Goodreads request.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      query: z.string().optional(),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
      mutationsOnly: z.boolean().default(false),
      limit: z.number().int().min(1).max(200).default(20),
    },
  },
  async ({ query, method, mutationsOnly, limit }) =>
    emit(await apiMapRoutes({ query, method, mutationsOnly, limit })),
);

registerTool(
  "goodreads_route_search",
  {
    title: "Goodreads Route Search",
    description:
      "Search mapped Goodreads web and catalog-only AppSync capabilities such as notes, ratings, shelf export, or messages.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      query: z.string(),
      limit: z.number().int().min(1).max(50).default(20),
    },
  },
  async ({ query, limit }) => emit(await apiMapSearch({ query, limit })),
);

registerTool(
  "goodreads_browser_routes",
  {
    title: "Goodreads Browser Routes",
    description: "List sanitized authenticated Chrome CDP route templates captured from Goodreads.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      summary: z.boolean().default(true),
    },
  },
  async ({ summary }) => emit(await browserRoutes({ summary })),
);

// ---------------------------------------------------------------------------
// Shelves + books
// ---------------------------------------------------------------------------
registerTool(
  "goodreads_shelves_discover",
  {
    title: "Goodreads Shelves Discover",
    description:
      "Discover account shelf slugs and counts from a shelf HTML fixture, or live from /review/list/{user}.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      fixture: z.string().optional(),
      user: z.string().optional(),
      baseUrl: z.string().optional(),
    },
  },
  async ({ fixture, user, baseUrl }) => emit(await shelvesDiscover({ fixture, user, baseUrl })),
);

registerTool(
  "goodreads_books_list",
  {
    title: "Goodreads Books List",
    description:
      "List one shelf from authenticated HTML fixtures (fixtureDir) or public RSS (user). Dedup + pagination summary.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      shelf: z.string(),
      fixtureDir: z.string().optional(),
      source: z.enum(["html", "rss"]).optional(),
      user: z.string().optional(),
      baseUrl: z.string().optional(),
    },
  },
  async ({ shelf, fixtureDir, source, user, baseUrl }) =>
    emit(await booksList({ shelf, fixtureDir, source, user, baseUrl })),
);

registerTool(
  "goodreads_books_export",
  {
    title: "Goodreads Books Export",
    description:
      "Export one or more shelves from fixture-backed authenticated HTML, deduped by book with per-shelf membership.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      fixtureDir: z.string(),
      shelves: z.string().optional(),
    },
  },
  async ({ fixtureDir, shelves }) => emit(await booksExport({ fixtureDir, shelves })),
);

registerTool(
  "goodreads_book_show",
  {
    title: "Goodreads Book Show",
    description:
      "Parse a public Goodreads book page (JSON-LD + Next.js metadata) from a fixture or live /book/show/{slugOrId}.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      slugOrId: z.string().optional(),
      fixture: z.string().optional(),
      baseUrl: z.string().optional(),
    },
  },
  async ({ slugOrId, fixture, baseUrl }) => emit(await bookShow({ slugOrId, fixture, baseUrl })),
);

// ---------------------------------------------------------------------------
// Comments + messages
// ---------------------------------------------------------------------------
registerTool(
  "goodreads_comments_list",
  {
    title: "Goodreads Comments List",
    description:
      "Plan or parse a user comments/recent-post page into redacted link/form shape (never raw comment text).",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      userSlug: z.string().optional(),
      fixture: z.string().optional(),
    },
  },
  async ({ userSlug, fixture }) => emit(await commentsList({ userSlug, fixture })),
);

registerTool(
  "goodreads_messages_folders",
  {
    title: "Goodreads Messages Folders",
    description:
      "List the currently mapped Goodreads message folders; pass a fixture to prove them from the current account UI.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      fixture: z.string().optional(),
    },
  },
  async ({ fixture }) => emit(await messagesFolders({ fixture })),
);

registerTool(
  "goodreads_messages_list",
  {
    title: "Goodreads Messages List",
    description:
      "Parse a message folder HTML fixture into redacted message metadata (ids, hrefs, form shapes — no bodies).",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      fixture: z.string(),
    },
  },
  async ({ fixture }) => emit(await messagesList({ fixture })),
);

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------
registerTool(
  "goodreads_annotations_list",
  {
    title: "Goodreads Annotations List",
    description:
      "Parse Kindle annotation metadata from a notes detail fixture without raw highlight text. Pair ids redacted unless includePrivateIds.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      fixture: z.string(),
      bookId: z.string().optional(),
      userSlug: z.string().optional(),
      includePrivateIds: z.boolean().default(false),
    },
  },
  async ({ fixture, bookId, userSlug, includePrivateIds }) =>
    emit(await annotationsList({ fixture, bookId, userSlug, includePrivateIds })),
);

registerTool(
  "goodreads_annotations_thoughts_plan",
  {
    title: "Goodreads Annotation Thoughts Plan",
    description:
      "Plan a per-note thought write without executing it. Disabled until an approved capture proves payload + CSRF.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      bookId: z.string(),
      annotationPairId: z.string(),
    },
  },
  async ({ bookId, annotationPairId }) =>
    emit(annotationsThoughtsPlan({ bookId, annotationPairId })),
);

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
registerTool(
  "goodreads_notes_inspect",
  {
    title: "Goodreads Notes Inspect",
    description:
      "Parse a notes index or book-detail HTML fixture into redacted metadata (counts, visibility, link shape).",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      fixture: z.string(),
    },
  },
  async ({ fixture }) => emit(await notesInspect({ fixture })),
);

registerTool(
  "goodreads_notes_publicize_plan",
  {
    title: "Goodreads Notes Publicize Plan",
    description:
      "Build the verified workflow plan for publicizing notes/highlights for one book. This does not submit anything.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      bookId: z.string(),
      bookSlug: z.string().optional(),
      userSlug: z.string().optional(),
      detailFixture: z.string().optional(),
      approvedBookId: z.array(z.string()).default([]),
    },
  },
  async ({ bookId, bookSlug, userSlug, detailFixture, approvedBookId }) =>
    emit(
      await notesPublicizePlan({
        bookId,
        bookSlug,
        userSlug,
        detailFixture,
        approvedBookIds: approvedBookId,
      }),
    ),
);

registerTool(
  "goodreads_notes_publicize",
  {
    title: "Goodreads Notes Publicize",
    description:
      "Execute the approved notes-publicize workflow (PUT /notes/{book_id}/share, visible=true). Gated: requires execute, exact approvedBookId, and GOODREADS_ALLOW_NOTES_PUBLICIZE=1. Defaults to a dry-run plan.",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: {
      bookId: z.string(),
      approvedBookId: z.array(z.string()).default([]),
      execute: z.boolean().default(false),
      dryRun: z.boolean().default(false),
    },
  },
  async ({ bookId, approvedBookId, execute, dryRun }) =>
    emit(await notesPublicize({ bookId, approvedBookIds: approvedBookId, execute, dryRun })),
);

registerTool(
  "goodreads_notes_hide",
  {
    title: "Goodreads Notes Hide",
    description:
      "Execute the approved notes-hide workflow (PUT /notes/{book_id}/share, visible=false). Gated: requires execute, exact approvedBookId, and GOODREADS_ALLOW_NOTES_PUBLICIZE=1. Defaults to a dry-run plan.",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: {
      bookId: z.string(),
      approvedBookId: z.array(z.string()).default([]),
      execute: z.boolean().default(false),
      dryRun: z.boolean().default(false),
    },
  },
  async ({ bookId, approvedBookId, execute, dryRun }) =>
    emit(await notesHide({ bookId, approvedBookIds: approvedBookId, execute, dryRun })),
);

// ---------------------------------------------------------------------------
// Quotes (writes default to dry-run)
// ---------------------------------------------------------------------------
registerTool(
  "goodreads_quotes_add",
  {
    title: "Goodreads Quotes Add",
    description: "Add (create) a quote via POST /quotes. Dry-run unless execute=true.",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: {
      body: z.string(),
      author: z.string(),
      title: z.string().optional(),
      tags: z.string().optional(),
      execute: z.boolean().default(false),
    },
  },
  async ({ body, author, title, tags, execute }) =>
    emit(await quotesAdd({ body, author, title, tags, execute })),
);

registerTool(
  "goodreads_quotes_remove",
  {
    title: "Goodreads Quotes Remove",
    description:
      "Remove one quote by slug via POST /quotes/{quote_slug}/remove. Dry-run unless execute=true.",
    annotations: toolAnnotations(false, "write-destructive"),
    inputSchema: {
      quoteSlug: z.string(),
      execute: z.boolean().default(false),
    },
  },
  async ({ quoteSlug, execute }) => emit(await quotesRemove({ quoteSlug, execute })),
);

registerTool(
  "goodreads_quotes_reorder",
  {
    title: "Goodreads Quotes Reorder",
    description:
      "Reorder one quote (up|down|top|bottom) via POST /quotes/move_*/{quote_id}. Dry-run unless execute=true.",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: {
      quoteId: z.string(),
      direction: z.enum(["up", "down", "top", "bottom"]),
      execute: z.boolean().default(false),
    },
  },
  async ({ quoteId, direction, execute }) =>
    emit(await quotesReorder({ quoteId, direction, execute })),
);

// ---------------------------------------------------------------------------
// Recent reading
// ---------------------------------------------------------------------------
registerTool(
  "goodreads_recent_reading_list",
  {
    title: "Goodreads Recent Reading List",
    description:
      "List current/recent shelf books from local authenticated fixtures. No Goodreads request is sent.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      fixtureDir: z.string(),
      shelves: z.array(z.string()).default(["currently-reading", "read"]),
      limit: z.number().int().min(1).max(200).default(25),
    },
  },
  async ({ fixtureDir, shelves, limit }) =>
    emit(await recentReadingList({ fixtureDir, shelves, limit })),
);

registerTool(
  "goodreads_recent_reading_notes",
  {
    title: "Goodreads Recent Reading Notes",
    description:
      "Join current/recent books to notes/highlights metadata without raw highlight text.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      fixtureDir: z.string(),
      notesIndexFixture: z.string().optional(),
      shelves: z.array(z.string()).default(["currently-reading", "read"]),
      limit: z.number().int().min(1).max(200).default(25),
    },
  },
  async ({ fixtureDir, notesIndexFixture, shelves, limit }) =>
    emit(await recentReadingNotes({ fixtureDir, notesIndexFixture, shelves, limit })),
);

registerTool(
  "goodreads_recent_reading_publicize_plan",
  {
    title: "Goodreads Recent Reading Publicize Plan",
    description:
      "Plan notes/highlights publicization from recent-reading inventory. This never submits Goodreads writes.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      fixtureDir: z.string(),
      notesIndexFixture: z.string().optional(),
      shelves: z.array(z.string()).default(["currently-reading", "read"]),
      limit: z.number().int().min(1).max(200).default(25),
      approvedBookId: z.array(z.string()).default([]),
    },
  },
  async ({ fixtureDir, notesIndexFixture, shelves, limit, approvedBookId }) =>
    emit(
      await recentReadingPublicizePlan({
        fixtureDir,
        notesIndexFixture,
        shelves,
        limit,
        approvedBookIds: approvedBookId,
      }),
    ),
);

registerTool(
  "goodreads_recent_reading_publicize",
  {
    title: "Goodreads Recent Reading Publicize",
    description:
      "Execute approved publicization for one recent/current book (PUT /notes/{book_id}/share, visible=true). Same gates as notes publicize. Defaults to a dry-run plan.",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: {
      bookId: z.string(),
      approvedBookId: z.array(z.string()).default([]),
      execute: z.boolean().default(false),
      dryRun: z.boolean().default(false),
    },
  },
  async ({ bookId, approvedBookId, execute, dryRun }) =>
    emit(
      await recentReadingPublicize({ bookId, approvedBookIds: approvedBookId, execute, dryRun }),
    ),
);

// ---------------------------------------------------------------------------
// Static write plans
// ---------------------------------------------------------------------------
registerTool(
  "goodreads_bookshelf_move_plan",
  {
    title: "Goodreads Bookshelf Move Plan",
    description:
      "Build a dry-run form plan for moving one shelf review row. This does not submit anything.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      reviewId: z.string(),
      toShelf: z.string(),
      user: z.string(),
    },
  },
  async ({ reviewId, toShelf, user }) => emit(bookshelfMovePlan({ reviewId, toShelf, user })),
);

registerTool(
  "goodreads_write_plan_notes_publicize",
  {
    title: "Goodreads Write-Plan Notes Publicize",
    description:
      "Build the static dry-run plan for publicizing all notes for a book. This does not submit anything.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      bookId: z.string(),
      bookSlug: z.string().optional(),
      userSlug: z.string().optional(),
    },
  },
  async ({ bookId, bookSlug, userSlug }) =>
    emit(writePlanNotesPublicize({ bookId, bookSlug, userSlug })),
);

// ---------------------------------------------------------------------------
// Raw request plan / execute
// ---------------------------------------------------------------------------
registerTool(
  "goodreads_request_plan",
  {
    title: "Goodreads Request Plan",
    description: "Build a live request plan from the bundled route map without sending it.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      route: z.string(),
      param: z.array(z.string()).default([]),
      query: z.array(z.string()).default([]),
      bodyJson: z.unknown().optional(),
      form: z.record(z.string(), z.string()).default({}),
      baseUrl: z.string().default("https://www.goodreads.com"),
      authenticated: z.boolean().default(false),
    },
  },
  async ({ route, param, query, bodyJson, form, baseUrl, authenticated }) =>
    emit(
      await requestPlan({
        routeSelector: route,
        baseUrl,
        pathParams: parsePairs(param),
        query: parsePairs(query),
        bodyJson,
        form,
        authenticated,
      }),
    ),
);

registerTool(
  "goodreads_request_execute",
  {
    title: "Goodreads Request Execute",
    description:
      "Run a mapped Goodreads web request. Reads run live; mutations require execute=true, exact approvedRoute, and GOODREADS_ALLOW_GENERIC_WRITES=1; otherwise they return a dry-run plan.",
    annotations: toolAnnotations(false, "write-destructive"),
    inputSchema: {
      route: z.string(),
      param: z.array(z.string()).default([]),
      query: z.array(z.string()).default([]),
      bodyJson: z.unknown().optional(),
      form: z.record(z.string(), z.string()).default({}),
      authenticated: z.boolean().default(false),
      approvedRoute: z.string().optional(),
      execute: z.boolean().default(false),
      dryRun: z.boolean().default(false),
    },
  },
  async ({ route, param, query, bodyJson, form, authenticated, approvedRoute, execute, dryRun }) =>
    emit(
      await requestExecute({
        routeSelector: route,
        pathParams: parsePairs(param),
        query: parsePairs(query),
        bodyJson,
        form,
        authenticated,
        approvedRoute,
        execute,
        dryRun,
      }),
    ),
);

// ---------------------------------------------------------------------------
// Guidance (MCP-only helper)
// ---------------------------------------------------------------------------
registerTool(
  "goodreads_dynamic_inventory_guidance",
  {
    title: "Goodreads Dynamic Inventory Guidance",
    description:
      "Explain how to discover account-specific shelves, folders, notes modules, pagination, and dynamic sublinks before acting.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {},
  },
  async () => emit(dynamicInventoryGuidance()),
);

const transport = new StdioServerTransport();
await server.connect(transport);
