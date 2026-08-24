#!/usr/bin/env node
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
  authorShow,
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
  notesBooks,
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
  recommendationsList,
  requestExecute,
  requestPlan,
  shelfAdd,
  shelfRemove,
  searchBooks,
  similarBooks,
  shelvesDiscover,
  yearInBooks,
  writePlanNotesPublicize,
  type Envelope,
  ls,
  ss,
  ru,
  rv,
} from "@zaydiscold/goodreads-cli/engine";
import type { RiskLevel } from "@zaydiscold/goodreads-cli/risk";
import { parseMcpProfile, toolsForProfile, type GoodreadsToolName } from "./profile.js";
import { resolveMcpFixture, resolveOptionalMcpFixture } from "./fixturePolicy.js";
import { quotePayloadSha256, requireApprovedBook, requireExactApproval } from "./writeApprovals.js";

const server = new McpServer({
  name: "goodreads-cli-mcp",
  version: "1.1.0",
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
    structuredContent: value as Record<string, unknown>,
  };
}

function emit(envelope: Envelope) {
  return jsonResponse(envelope);
}

function extendData(envelope: Envelope, extra: Record<string, unknown>): Envelope {
  return {
    ...envelope,
    data: {
      ...((envelope.data && typeof envelope.data === "object" ? envelope.data : {}) as object),
      ...extra,
    },
  };
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

function privateIdsAllowed(requested: boolean): boolean {
  if (!requested) return false;
  if (process.env.GOODREADS_MCP_ALLOW_PRIVATE_IDS !== "1") {
    throw new Error(
      "includePrivateIds requires GOODREADS_MCP_ALLOW_PRIVATE_IDS=1 and private local handling",
    );
  }
  return true;
}

registerTool(
  "goodreads_api_map_routes",
  {
    title: "Goodreads API Map Routes",
    description:
      "List bounded routes from the local Goodreads API map. No network request is sent.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      query: z.string().optional(),
      method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]).optional(),
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
    description: "Search mapped Goodreads web and catalog-only AppSync capabilities.",
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
    inputSchema: { summary: z.boolean().default(true) },
  },
  async ({ summary }) => emit(await browserRoutes({ summary })),
);

registerTool(
  "goodreads_shelves_discover",
  {
    title: "Goodreads Shelves Discover",
    description:
      "Discover shelf slugs and counts from an owned fixture or a live authenticated shelf page.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      fixture: z.string().optional(),
      user: z.string().optional(),
      baseUrl: z.string().optional(),
    },
  },
  async ({ fixture, user, baseUrl }) =>
    emit(
      await shelvesDiscover({
        fixture: resolveOptionalMcpFixture(fixture),
        user,
        baseUrl,
      }),
    ),
);

registerTool(
  "goodreads_books_list",
  {
    title: "Goodreads Books List",
    description: "List one shelf from owned HTML fixtures, authenticated HTML, or public RSS.",
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
    emit(
      await booksList({
        shelf,
        fixtureDir: resolveOptionalMcpFixture(fixtureDir),
        source,
        user,
        baseUrl,
      }),
    ),
);

registerTool(
  "goodreads_books_export",
  {
    title: "Goodreads Books Export",
    description:
      "Export shelves from an owned fixture directory with per-shelf completeness metadata.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      fixtureDir: z.string(),
      shelves: z.string().optional(),
    },
  },
  async ({ fixtureDir, shelves }) =>
    emit(await booksExport({ fixtureDir: resolveMcpFixture(fixtureDir), shelves })),
);

registerTool(
  "goodreads_book_show",
  {
    title: "Goodreads Book Show",
    description: "Parse public Goodreads book metadata from an owned fixture or live book page.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      slugOrId: z.string().optional(),
      fixture: z.string().optional(),
      baseUrl: z.string().optional(),
    },
  },
  async ({ slugOrId, fixture, baseUrl }) =>
    emit(
      await bookShow({
        slugOrId,
        fixture: resolveOptionalMcpFixture(fixture),
        baseUrl,
      }),
    ),
);

registerTool(
  "goodreads_similar_books",
  {
    title: "Goodreads Similar Books",
    description:
      "List public Readers-also-enjoyed metadata without descriptions, reviews, or images.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      workSlug: z.string().optional(),
      fixture: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
      baseUrl: z.string().optional(),
    },
  },
  async ({ workSlug, fixture, limit, baseUrl }) =>
    emit(
      await similarBooks({
        workSlug,
        fixture: resolveOptionalMcpFixture(fixture),
        limit,
        baseUrl,
      }),
    ),
);

registerTool(
  "goodreads_search_books",
  {
    title: "Goodreads Book Search",
    description: "Resolve title and author input into bounded Goodreads edition candidates.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      query: z.string(),
      limit: z.number().int().min(1).max(100).default(20),
      baseUrl: z.string().optional(),
    },
  },
  async ({ query, limit, baseUrl }) => emit(await searchBooks({ query, limit, baseUrl })),
);

registerTool(
  "goodreads_recommendations_list",
  {
    title: "Goodreads Recommendations",
    description:
      "List authenticated recommendation-card book metadata without private recommendation prose.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(20),
      baseUrl: z.string().optional(),
    },
  },
  async ({ limit, baseUrl }) => emit(await recommendationsList({ limit, baseUrl })),
);

registerTool(
  "goodreads_author_show",
  {
    title: "Goodreads Author Show",
    description:
      "Read public author identity and bounded bibliography metadata without biography prose.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      authorSlug: z.string(),
      limit: z.number().int().min(1).max(100).default(20),
      baseUrl: z.string().optional(),
    },
  },
  async ({ authorSlug, limit, baseUrl }) => emit(await authorShow({ authorSlug, limit, baseUrl })),
);

registerTool(
  "goodreads_year_in_books",
  {
    title: "Goodreads Year in Books",
    description: "Read public Year in Books totals and extrema without review text.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      userId: z.string(),
      year: z.number().int().min(2000).max(2100),
      fixture: z.string().optional(),
      baseUrl: z.string().optional(),
    },
  },
  async ({ userId, year, fixture, baseUrl }) =>
    emit(
      await yearInBooks({
        userId,
        year,
        fixture: resolveOptionalMcpFixture(fixture),
        baseUrl,
      }),
    ),
);

registerTool(
  "goodreads_comments_list",
  {
    title: "Goodreads Comments List",
    description: "Read live or fixture-backed comments metadata without raw comment text.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      userSlug: z.string().optional(),
      fixture: z.string().optional(),
    },
  },
  async ({ userSlug, fixture }) =>
    emit(await commentsList({ userSlug, fixture: resolveOptionalMcpFixture(fixture) })),
);

registerTool(
  "goodreads_messages_folders",
  {
    title: "Goodreads Message Folders",
    description: "List mapped message folders or discover them from an owned fixture.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: { fixture: z.string().optional() },
  },
  async ({ fixture }) =>
    emit(await messagesFolders({ fixture: resolveOptionalMcpFixture(fixture) })),
);

registerTool(
  "goodreads_messages_list",
  {
    title: "Goodreads Messages List",
    description: "Parse an owned message fixture into IDs and structural metadata without bodies.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: { fixture: z.string() },
  },
  async ({ fixture }) => emit(await messagesList({ fixture: resolveMcpFixture(fixture) })),
);

registerTool(
  "goodreads_annotations_list",
  {
    title: "Goodreads Annotations List",
    description:
      "Parse annotation metadata without highlight text. Private IDs require an explicit server gate.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      fixture: z.string(),
      bookId: z.string().optional(),
      userSlug: z.string().optional(),
      includePrivateIds: z.boolean().default(false),
    },
  },
  async ({ fixture, bookId, userSlug, includePrivateIds }) =>
    emit(
      await annotationsList({
        fixture: resolveMcpFixture(fixture),
        bookId,
        userSlug,
        includePrivateIds: privateIdsAllowed(includePrivateIds),
      }),
    ),
);

registerTool(
  "goodreads_annotations_thoughts_plan",
  {
    title: "Goodreads Annotation Thoughts Plan",
    description: "Plan a per-note thought write without executing it.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      bookId: z.string(),
      annotationPairId: z.string(),
    },
  },
  async ({ bookId, annotationPairId }) =>
    emit(annotationsThoughtsPlan({ bookId, annotationPairId })),
);

registerTool(
  "goodreads_notes_inspect",
  {
    title: "Goodreads Notes Inspect",
    description:
      "Parse an owned notes fixture into redacted counts, visibility, and link metadata.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      fixture: z.string(),
      includePrivateIds: z.boolean().default(false),
    },
  },
  async ({ fixture, includePrivateIds }) =>
    emit(
      await notesInspect({
        fixture: resolveMcpFixture(fixture),
        includePrivateIds: privateIdsAllowed(includePrivateIds),
      }),
    ),
);

registerTool(
  "goodreads_notes_books",
  {
    title: "Goodreads Annotated Books",
    description:
      "List public annotated-book metadata and available counts without annotation text.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      userId: z.string(),
      limit: z.number().int().min(1).max(500).default(100),
      baseUrl: z.string().optional(),
    },
  },
  async ({ userId, limit, baseUrl }) => emit(await notesBooks({ userId, limit, baseUrl })),
);

registerTool(
  "goodreads_notes_publicize_plan",
  {
    title: "Goodreads Notes Publicize Plan",
    description: "Build a redacted, non-executing notes-publicize plan for one exact book.",
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
        detailFixture: resolveOptionalMcpFixture(detailFixture),
        approvedBookIds: approvedBookId,
      }),
    ),
);

registerTool(
  "goodreads_notes_publicize",
  {
    title: "Goodreads Notes Publicize",
    description:
      "Dry-run by default. Live execution requires exact book approval and the notes write environment gate.",
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
      "Dry-run by default. Live execution requires exact book approval and the notes write environment gate.",
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

registerTool(
  "goodreads_quotes_add",
  {
    title: "Goodreads Quotes Add",
    description:
      "Preview or create a quote. Live execution requires approvedPayloadSha256 for the exact normalized payload.",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: {
      body: z.string(),
      author: z.string(),
      title: z.string().optional(),
      tags: z.string().optional(),
      approvedPayloadSha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/i)
        .optional(),
      execute: z.boolean().default(false),
    },
  },
  async ({ body, author, title, tags, approvedPayloadSha256, execute }) => {
    const payloadSha256 = quotePayloadSha256({ body, author, title, tags });
    if (execute)
      requireExactApproval("approvedPayloadSha256", payloadSha256, approvedPayloadSha256);
    const result = await quotesAdd({ body, author, title, tags, execute });
    return emit(
      extendData(result, { requiredApprovals: { approvedPayloadSha256: payloadSha256 } }),
    );
  },
);

registerTool(
  "goodreads_quotes_remove",
  {
    title: "Goodreads Quotes Remove",
    description:
      "Preview or remove one quote. Live execution requires approvedQuoteSlug to match exactly.",
    annotations: toolAnnotations(false, "write-destructive"),
    inputSchema: {
      quoteSlug: z.string(),
      approvedQuoteSlug: z.string().optional(),
      execute: z.boolean().default(false),
    },
  },
  async ({ quoteSlug, approvedQuoteSlug, execute }) => {
    if (execute) requireExactApproval("approvedQuoteSlug", quoteSlug, approvedQuoteSlug);
    const result = await quotesRemove({ quoteSlug, execute });
    return emit(extendData(result, { requiredApprovals: { approvedQuoteSlug: quoteSlug } }));
  },
);

registerTool(
  "goodreads_quotes_reorder",
  {
    title: "Goodreads Quotes Reorder",
    description:
      "Preview or reorder one quote. Live execution requires exact quote ID and direction approvals.",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: {
      quoteId: z.string(),
      direction: z.enum(["up", "down", "top", "bottom"]),
      approvedQuoteId: z.string().optional(),
      approvedDirection: z.enum(["up", "down", "top", "bottom"]).optional(),
      execute: z.boolean().default(false),
    },
  },
  async ({ quoteId, direction, approvedQuoteId, approvedDirection, execute }) => {
    if (execute) {
      requireExactApproval("approvedQuoteId", quoteId, approvedQuoteId);
      requireExactApproval("approvedDirection", direction, approvedDirection);
    }
    const result = await quotesReorder({ quoteId, direction, execute });
    return emit(
      extendData(result, {
        requiredApprovals: { approvedQuoteId: quoteId, approvedDirection: direction },
      }),
    );
  },
);

registerTool(
  "goodreads_shelf_add",
  {
    title: "Goodreads Shelf Add",
    description:
      "Preview or add one exact book to one exact shelf. Live execution requires both approvals.",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: {
      bookId: z.string(),
      shelf: z.string(),
      approvedBookId: z.array(z.string()).default([]),
      approvedShelf: z.string().optional(),
      execute: z.boolean().default(false),
    },
  },
  async ({ bookId, shelf, approvedBookId, approvedShelf, execute }) => {
    if (execute) {
      requireApprovedBook(bookId, approvedBookId);
      requireExactApproval("approvedShelf", shelf, approvedShelf);
    }
    const result = await shelfAdd({ bookId, shelf, execute });
    return emit(
      extendData(result, { requiredApprovals: { approvedBookId: [bookId], approvedShelf: shelf } }),
    );
  },
);

registerTool(
  "goodreads_shelf_remove",
  {
    title: "Goodreads Shelf Remove",
    description:
      "Preview or remove one exact book from one exact shelf. Live execution requires both approvals.",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: {
      bookId: z.string(),
      shelf: z.string(),
      approvedBookId: z.array(z.string()).default([]),
      approvedShelf: z.string().optional(),
      execute: z.boolean().default(false),
    },
  },
  async ({ bookId, shelf, approvedBookId, approvedShelf, execute }) => {
    if (execute) {
      requireApprovedBook(bookId, approvedBookId);
      requireExactApproval("approvedShelf", shelf, approvedShelf);
    }
    const result = await shelfRemove({ bookId, shelf, execute });
    return emit(
      extendData(result, { requiredApprovals: { approvedBookId: [bookId], approvedShelf: shelf } }),
    );
  },
);

registerTool(
  "goodreads_recent_reading_list",
  {
    title: "Goodreads Recent Reading List",
    description:
      "List current/recent books from an owned fixture directory. No network request is sent.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      fixtureDir: z.string(),
      shelves: z.array(z.string()).default(["currently-reading", "read"]),
      limit: z.number().int().min(1).max(200).default(25),
    },
  },
  async ({ fixtureDir, shelves, limit }) =>
    emit(await recentReadingList({ fixtureDir: resolveMcpFixture(fixtureDir), shelves, limit })),
);

registerTool(
  "goodreads_recent_reading_notes",
  {
    title: "Goodreads Recent Reading Notes",
    description: "Join recent books to notes metadata without raw highlight text.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {
      fixtureDir: z.string(),
      notesIndexFixture: z.string().optional(),
      shelves: z.array(z.string()).default(["currently-reading", "read"]),
      limit: z.number().int().min(1).max(200).default(25),
    },
  },
  async ({ fixtureDir, notesIndexFixture, shelves, limit }) =>
    emit(
      await recentReadingNotes({
        fixtureDir: resolveMcpFixture(fixtureDir),
        notesIndexFixture: resolveOptionalMcpFixture(notesIndexFixture),
        shelves,
        limit,
      }),
    ),
);

registerTool(
  "goodreads_recent_reading_publicize_plan",
  {
    title: "Goodreads Recent Reading Publicize Plan",
    description: "Build a non-executing notes-publicize plan from owned recent-reading fixtures.",
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
        fixtureDir: resolveMcpFixture(fixtureDir),
        notesIndexFixture: resolveOptionalMcpFixture(notesIndexFixture),
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
      "Dry-run by default. Live execution uses the same exact book and environment gates as notes publicize.",
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

registerTool(
  "goodreads_bookshelf_move_plan",
  {
    title: "Goodreads Bookshelf Move Plan",
    description: "Build a non-executing shelf-review move form plan.",
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
    description: "Build a static non-executing notes-publicize plan.",
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

registerTool(
  "goodreads_request_plan",
  {
    title: "Goodreads Request Plan",
    description: "Build a local mapped request plan without sending it.",
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
      "Reads run live. Mutations remain previews unless execute, exact route approval, and the generic write gate are all present. An explicit dryRun never needs live authorization.",
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

registerTool(
  "goodreads_dynamic_inventory_guidance",
  {
    title: "Goodreads Dynamic Inventory Guidance",
    description:
      "Explain which account-specific collections must be discovered before an agent acts.",
    annotations: toolAnnotations(true, "read", false),
    inputSchema: {},
  },
  async () => emit(dynamicInventoryGuidance()),
);

registerTool(
  "goodreads_library_show",
  {
    title: "Goodreads Library Show",
    description: "Read status, rating, review hash/length, and source evidence for one exact book.",
    inputSchema: {
      bookId: z.string(),
      userId: z.string().optional(),
      includeReviewId: z.boolean().default(false),
    },
    annotations: toolAnnotations(true, "read"),
  },
  async ({ bookId, userId, includeReviewId }) =>
    emit(await ls({ bookId, userId, includeReviewId })),
);

registerTool(
  "goodreads_library_set_status",
  {
    title: "Goodreads Library Set Status",
    description:
      "Dry-run by default. Live execution requires exact book and status approvals and verifies account state.",
    inputSchema: {
      bookId: z.string(),
      userId: z.string().optional(),
      status: z.enum(["to-read", "currently-reading", "read"]),
      approvedBookId: z.array(z.string()).default([]),
      approvedStatus: z.enum(["to-read", "currently-reading", "read"]).optional(),
      execute: z.boolean().default(false),
    },
    annotations: toolAnnotations(false, "write-mutate"),
  },
  async ({ bookId, userId, status, approvedBookId, approvedStatus, execute }) =>
    emit(await ss({ bookId, userId, status, approvedBookId, approvedStatus, execute })),
);

registerTool(
  "goodreads_rating_update",
  {
    title: "Goodreads Rating Update",
    description:
      "Dry-run by default. Live execution requires exact book and rating approvals and verifies account state.",
    inputSchema: {
      bookId: z.string(),
      action: z.enum(["set", "clear"]),
      rating: z.number().int().min(1).max(5).optional(),
      approvedBookId: z.array(z.string()).default([]),
      approvedRating: z.number().int().min(1).max(5).optional(),
      execute: z.boolean().default(false),
    },
    annotations: toolAnnotations(false, "write-mutate"),
  },
  async ({ bookId, action, rating, approvedBookId, approvedRating, execute }) =>
    emit(
      await ru({
        bookId,
        action,
        rating: rating as 1 | 2 | 3 | 4 | 5 | undefined,
        approvedBookId,
        approvedRating: approvedRating as 1 | 2 | 3 | 4 | 5 | undefined,
        execute,
      }),
    ),
);

registerTool(
  "goodreads_review_upsert",
  {
    title: "Goodreads Review Upsert",
    description:
      "Dry-run by default. Live execution requires exact book and canonical review SHA-256 approvals and verifies exact content hash.",
    inputSchema: {
      bookId: z.string(),
      userId: z.string().optional(),
      reviewText: z.string(),
      approvedBookId: z.array(z.string()).default([]),
      approvedTextSha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/i)
        .optional(),
      execute: z.boolean().default(false),
    },
    annotations: toolAnnotations(false, "write-mutate"),
  },
  async ({ bookId, userId, reviewText, approvedBookId, approvedTextSha256, execute }) =>
    emit(
      await rv({
        bookId,
        userId,
        reviewText,
        approvedBookId,
        approvedTextSha256,
        execute,
      }),
    ),
);

const transport = new StdioServerTransport();
await server.connect(transport);
