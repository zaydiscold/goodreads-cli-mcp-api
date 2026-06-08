#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  loadBrowserRoutes,
  loadApiMapRoutes,
  planBookshelfMove,
  searchApiRoutes,
  summarizeBrowserRoutes,
  type GoodreadsRoute
} from "@zaydiscold/goodreads-cli/lib";
import { buildLiveRequestPlan, executeLiveRequest } from "@zaydiscold/goodreads-cli/live";
import { emitLiveMutationWarning, riskLevelForRoute, type RiskLevel } from "@zaydiscold/goodreads-cli/risk";
import {
  buildRecentReadingList,
  buildRecentReadingNotes,
  buildRecentReadingPublicizePlan,
  buildNotesPublicizeWorkflowPlan
} from "@zaydiscold/goodreads-cli/workflows";

const server = new McpServer({
  name: "goodreads-cli-mcp",
  version: "0.1.0"
});

function jsonResponse(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }]
  };
}

function toolAnnotations(readOnly: boolean, risk: RiskLevel) {
  return {
    readOnlyHint: readOnly,
    destructiveHint: risk === "write-destructive",
    idempotentHint: risk === "read" || risk === "write-safe",
    openWorldHint: true,
    "mcp:read-only": readOnly,
    "mcp:risk": risk
  } as any;
}

function parsePairs(values: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const value of values ?? []) {
    const index = value.indexOf("=");
    if (index <= 0) throw new Error(`expected name=value, got ${value}`);
    out[value.slice(0, index)] = value.slice(index + 1);
  }
  return out;
}

async function findRoute(selector: string): Promise<GoodreadsRoute> {
  const routes = await loadApiMapRoutes();
  const route = routes.find(
    (candidate) => candidate.id === selector || candidate.path === selector || `${candidate.method} ${candidate.path}` === selector
  );
  if (!route) throw new Error(`unknown Goodreads route: ${selector}`);
  return route;
}

server.registerTool(
  "goodreads_api_map_routes",
  {
    title: "Goodreads API Map Routes",
    description: "List bundled Goodreads web/RSS routes. This reads local api-map files and makes no Goodreads request.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      query: z.string().optional(),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
      mutationsOnly: z.boolean().default(false),
      limit: z.number().int().min(1).max(200).default(80)
    }
  },
  async ({ query, method, mutationsOnly, limit }) => {
    let routes = query ? searchApiRoutes(await loadApiMapRoutes(), query, limit) : await loadApiMapRoutes();
    if (method) {
      routes = routes.filter((route) => route.method === method);
    }
    if (mutationsOnly) {
      routes = routes.filter((route) => route.mutatesAccount);
    }
    return jsonResponse({ count: routes.slice(0, limit).length, routes: routes.slice(0, limit) });
  }
);

server.registerTool(
  "goodreads_route_search",
  {
    title: "Goodreads Route Search",
    description: "Search mapped Goodreads capabilities such as notes publicizing, friend requests, shelf export, or message folders.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      query: z.string(),
      limit: z.number().int().min(1).max(50).default(20)
    }
  },
  async ({ query, limit }) => {
    const routes = searchApiRoutes(await loadApiMapRoutes(), query, limit);
    return jsonResponse({ query, count: routes.length, routes });
  }
);

server.registerTool(
  "goodreads_browser_routes",
  {
    title: "Goodreads Browser Routes",
    description: "List sanitized authenticated Chrome CDP route templates captured from Goodreads.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      summary: z.boolean().default(false)
    }
  },
  async ({ summary }) => {
    const routes = await loadBrowserRoutes();
    return jsonResponse(summary ? summarizeBrowserRoutes(routes) : { count: routes.length, routes });
  }
);

server.registerTool(
  "goodreads_bookshelf_move_plan",
  {
    title: "Goodreads Bookshelf Move Plan",
    description: "Build a dry-run form plan for moving one shelf review row. This does not submit anything.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      reviewId: z.string(),
      toShelf: z.string(),
      user: z.string()
    }
  },
  async ({ reviewId, toShelf, user }) => jsonResponse(planBookshelfMove({ reviewId, toShelf, user }))
);

server.registerTool(
  "goodreads_notes_publicize_plan",
  {
    title: "Goodreads Notes Publicize Plan",
    description: "Build the verified workflow plan for publicizing notes/highlights for one book. This does not submit anything.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      bookId: z.string(),
      bookSlug: z.string().optional(),
      userSlug: z.string().optional(),
      detailFixture: z.string().optional(),
      approvedBookId: z.array(z.string()).default([])
    }
  },
  async ({ bookId, bookSlug, userSlug, detailFixture, approvedBookId }) =>
    jsonResponse(
      await buildNotesPublicizeWorkflowPlan({
        bookId,
        bookSlug,
        userSlug,
        detailFixture,
        approvedBookIds: approvedBookId
      })
    )
);

server.registerTool(
  "goodreads_notes_hide",
  {
    title: "Goodreads Notes Hide",
    description: "Hide all notes/highlights for a book via PUT /notes/{book_id}/share with visible=false. Requires GOODREADS_COOKIE + GOODREADS_CSRF_TOKEN. Defaults to dry-run.",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: {
      bookId: z.string(),
      dryRun: z.boolean().default(true)
    }
  },
  async ({ bookId, dryRun }) => {
    const route = (await loadApiMapRoutes()).find(
      (r) => `${r.method} ${r.path}` === "PUT /notes/{book_id}/share"
    );
    if (!route) throw new Error("PUT /notes/{book_id}/share is missing from the api-map");
    if (dryRun) {
      return jsonResponse({ ...buildLiveRequestPlan(route, { pathParams: { book_id: bookId }, form: { visible: "false" }, dryRun: true }), riskLevel: "write-mutate" });
    }
    emitLiveMutationWarning(route);
    return jsonResponse(await executeLiveRequest(route, { pathParams: { book_id: bookId }, form: { visible: "false" }, dryRun: false }));
  }
);

server.registerTool(
  "goodreads_recent_reading_list",
  {
    title: "Goodreads Recent Reading List",
    description: "List current/recent shelf books from local authenticated fixtures. No Goodreads request is sent.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      fixtureDir: z.string(),
      shelves: z.array(z.string()).default(["currently-reading", "read"]),
      limit: z.number().int().min(1).max(200).default(25)
    }
  },
  async ({ fixtureDir, shelves, limit }) => jsonResponse(await buildRecentReadingList({ fixtureDir, shelves, limit }))
);

server.registerTool(
  "goodreads_recent_reading_notes",
  {
    title: "Goodreads Recent Reading Notes",
    description: "Join current/recent books to notes/highlights metadata without raw highlight text.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      fixtureDir: z.string(),
      notesIndexFixture: z.string().optional(),
      shelves: z.array(z.string()).default(["currently-reading", "read"]),
      limit: z.number().int().min(1).max(200).default(25)
    }
  },
  async ({ fixtureDir, notesIndexFixture, shelves, limit }) =>
    jsonResponse(await buildRecentReadingNotes({ fixtureDir, notesIndexFixture, shelves, limit }))
);

server.registerTool(
  "goodreads_recent_reading_publicize_plan",
  {
    title: "Goodreads Recent Reading Publicize Plan",
    description: "Plan notes/highlights publicization from recent-reading inventory. This never submits Goodreads writes.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {
      fixtureDir: z.string(),
      notesIndexFixture: z.string().optional(),
      shelves: z.array(z.string()).default(["currently-reading", "read"]),
      limit: z.number().int().min(1).max(200).default(25),
      approvedBookId: z.array(z.string()).default([])
    }
  },
  async ({ fixtureDir, notesIndexFixture, shelves, limit, approvedBookId }) =>
    jsonResponse(
      await buildRecentReadingPublicizePlan({
        fixtureDir,
        notesIndexFixture,
        shelves,
        limit,
        approvedBookIds: approvedBookId
      })
    )
);

server.registerTool(
  "goodreads_request_execute",
  {
    title: "Goodreads Request Execute",
    description:
      "Execute a live Goodreads web request from the bundled route map. Personal repo has no env write gate; set dryRun true to preview.",
    annotations: toolAnnotations(false, "write-mutate"),
    inputSchema: {
      route: z.string(),
      param: z.array(z.string()).default([]),
      query: z.array(z.string()).default([]),
      bodyJson: z.unknown().optional(),
      form: z.record(z.string(), z.string()).default({}),
      baseUrl: z.string().default("https://www.goodreads.com"),
      dryRun: z.boolean().default(false)
    }
  },
  async ({ route: selector, param, query, bodyJson, form, baseUrl, dryRun }) => {
    const route = await findRoute(selector);
    const options = {
      baseUrl,
      pathParams: parsePairs(param),
      query: parsePairs(query),
      bodyJson,
      form,
      dryRun
    };
    if (dryRun) {
      return jsonResponse({ ...buildLiveRequestPlan(route, options), riskLevel: riskLevelForRoute(route) });
    }
    emitLiveMutationWarning(route);
    return jsonResponse(await executeLiveRequest(route, options));
  }
);

server.registerTool(
  "goodreads_dynamic_inventory_guidance",
  {
    title: "Goodreads Dynamic Inventory Guidance",
    description: "Explain how to discover account-specific shelves, folders, notes modules, pagination, and dynamic sublinks before acting.",
    annotations: toolAnnotations(true, "read"),
    inputSchema: {}
  },
  async () =>
    jsonResponse({
      rule: "Discover current account/page inventory before acting.",
      dynamicSurfaces: [
        "custom shelves and shelf counts",
        "review/list pagination and private RSS caps",
        "message folders and batch forms",
        "notes/highlights book links, note ids, visibility state, and spoiler controls",
        "friends/following/profile/comments route anchors",
        "year-in-books and people discovery pages"
      ],
      writeBoundary:
        "Use plan tools by default. Do not submit notes, shelf, message, review, or account mutations without explicit approval for that exact route and current page."
    })
);

const transport = new StdioServerTransport();
await server.connect(transport);
