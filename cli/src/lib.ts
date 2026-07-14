import { readFile, readdir } from "node:fs/promises";
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import type { CommandEnvelope, Confidence } from "./types/index.js";

export function nowIso(): string {
  return new Date().toISOString();
}

export function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

export function shortText(value: string | null | undefined, limit = 180): string | null {
  const text = cleanText(value);
  if (!text) return null;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}...`;
}

export function parseInteger(value: string | null | undefined): number | null {
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Number.parseInt(digits, 10) : null;
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function envelope<T>(
  data: T,
  options: {
    confidence?: Confidence;
    warnings?: string[];
    accountUserId?: string;
    accountUserSlug?: string;
  } = {},
): CommandEnvelope<T> {
  return {
    source: "goodreads-web",
    accountUserId: options.accountUserId,
    accountUserSlug: options.accountUserSlug,
    generatedAt: nowIso(),
    confidence: options.confidence ?? "high",
    warnings: options.warnings ?? [],
    data,
  };
}

export async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function readJson<T = unknown>(path: string): Promise<T> {
  return JSON.parse(await readText(path)) as T;
}

export function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function repoRootFromCli(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (fileExists(join(current, "api-map/openapi/undocumented/goodreads-web.yaml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(
    "Could not locate repo root with api-map/openapi/undocumented/goodreads-web.yaml",
  );
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

interface OpenApiParameter {
  name?: string;
  in?: string;
  required?: boolean;
}

interface OpenApiOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: Array<OpenApiParameter | { $ref?: string }>;
}

interface OpenApiDocument {
  paths?: Record<string, Record<string, OpenApiOperation>>;
}

export interface GoodreadsRoute {
  id: string;
  method: string;
  path: string;
  tags: string[];
  summary: string | null;
  description: string | null;
  parameters: Array<{
    name: string;
    in: string | null;
    required: boolean;
  }>;
  mutatesAccount: boolean;
  requiresApproval: boolean;
  executable?: boolean;
  transport?: "goodreads-web" | "appsync-graphql";
  evidence?: string | null;
}

interface GraphqlCatalogOperation {
  name: string;
  type: "query" | "mutation";
  summary: string;
  variables?: string[];
  evidence?: string;
  safety?: string;
  cli_support?: string;
}

interface GraphqlCatalog {
  operations?: GraphqlCatalogOperation[];
}

export interface GoodreadsBrowserRoute {
  method: string;
  scheme: string;
  host: string;
  path_template: string;
  query_keys: string[];
  resource_type: string;
  initiator_type: string;
  status: number;
  mime_type: string;
  from_disk_cache: boolean;
  from_service_worker: boolean;
  observed_count: number;
  statuses: number[];
}

function routeId(method: string, path: string): string {
  const slug = path
    .replace(/^\//, "")
    .replace(/\{([^}]+)\}/g, "$1")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${method.toLowerCase()}_${slug || "home"}`;
}

function isMutation(method: string, path: string, summary: string | null): boolean {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) return true;
  if (path === "/message/mark_all_as_read") return true;
  return Boolean(summary?.toLowerCase().includes("account mutation"));
}

export async function loadApiMapRoutes(): Promise<GoodreadsRoute[]> {
  const root = repoRootFromCli();
  const apiPath = join(root, "api-map/openapi/undocumented/goodreads-web.yaml");
  const doc = YAML.parse(await readFile(apiPath, "utf8")) as OpenApiDocument;
  const routes = Object.entries(doc.paths ?? {}).flatMap(([path, methods]) =>
    Object.entries(methods)
      .filter(([method]) => method.toLowerCase() !== "parameters")
      .map(([method, operation]) => {
        const upperMethod = method.toUpperCase();
        const summary = operation.summary ?? null;
        const mutatesAccount = isMutation(upperMethod, path, summary);
        return {
          id: routeId(upperMethod, path),
          method: upperMethod,
          path,
          tags: operation.tags ?? [],
          summary,
          description: operation.description ?? null,
          parameters: (operation.parameters ?? [])
            .filter((parameter): parameter is OpenApiParameter => "name" in parameter)
            .map((parameter) => ({
              name: parameter.name ?? "",
              in: parameter.in ?? null,
              required: Boolean(parameter.required),
            }))
            .filter((parameter) => parameter.name.length > 0),
          mutatesAccount,
          requiresApproval: mutatesAccount,
        } satisfies GoodreadsRoute;
      }),
  );
  return routes.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadGraphqlCatalogRoutes(): Promise<GoodreadsRoute[]> {
  const root = repoRootFromCli();
  const catalogPath = join(root, "api-map/graphql/goodreads-appsync.yaml");
  const catalog = YAML.parse(await readFile(catalogPath, "utf8")) as GraphqlCatalog;
  return (catalog.operations ?? [])
    .filter((operation) => operation.cli_support !== "omit")
    .map((operation) => {
      const mutatesAccount = operation.type === "mutation";
      return {
        id: `graphql_${operation.type}_${operation.name.toLowerCase()}`,
        method: operation.type === "mutation" ? "GRAPHQL_MUTATION" : "GRAPHQL_QUERY",
        path: `/graphql#${operation.name}`,
        tags: ["graphql", operation.type],
        summary: operation.summary,
        description: operation.safety ?? "Cataloged AppSync operation; execution is not enabled.",
        parameters: (operation.variables ?? []).map((name) => ({
          name,
          in: "graphql-variable",
          required: false,
        })),
        mutatesAccount,
        requiresApproval: mutatesAccount,
        executable: false,
        transport: "appsync-graphql",
        evidence: operation.evidence ?? null,
      } satisfies GoodreadsRoute;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadSearchableApiEntries(): Promise<GoodreadsRoute[]> {
  return [...(await loadApiMapRoutes()), ...(await loadGraphqlCatalogRoutes())];
}

export async function loadBrowserRoutes(): Promise<GoodreadsBrowserRoute[]> {
  const root = repoRootFromCli();
  const apiMapDir = join(root, "api-map");
  const files = (await readdir(apiMapDir))
    .filter((file) => /^browser-cdp-routes-\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort()
    .reverse();
  const latest = files[0];
  if (!latest) return [];
  return readJson<GoodreadsBrowserRoute[]>(join(apiMapDir, latest));
}

export function summarizeBrowserRoutes(routes: GoodreadsBrowserRoute[]): Record<string, unknown> {
  const byHost: Record<string, number> = {};
  const byMethod: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byResourceType: Record<string, number> = {};
  for (const route of routes) {
    byHost[route.host] = (byHost[route.host] ?? 0) + 1;
    byMethod[route.method] = (byMethod[route.method] ?? 0) + 1;
    for (const statusCode of route.statuses.length > 0 ? route.statuses : [route.status]) {
      byStatus[String(statusCode)] = (byStatus[String(statusCode)] ?? 0) + 1;
    }
    byResourceType[route.resource_type] = (byResourceType[route.resource_type] ?? 0) + 1;
  }
  return {
    captured: "2026-05-26 authenticated Chrome CDP",
    routeCount: routes.length,
    byHost,
    byMethod,
    byStatus,
    byResourceType,
    privacy:
      "headers, bodies, cookies, localStorage, sessionStorage, raw account URLs, private messages, and highlight text were not stored",
  };
}

function searchTerms(query: string): string[] {
  const stop = new Set(["and", "the", "for", "with", "goodreads", "route", "page"]);
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((term) => term.length >= 3 && !stop.has(term));
}

export function searchApiRoutes(
  routes: GoodreadsRoute[],
  query: string,
  limit = 20,
): GoodreadsRoute[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  return routes
    .map((route) => {
      const haystack = [
        route.id,
        route.method,
        route.path,
        route.summary ?? "",
        route.description ?? "",
        route.tags.join(" "),
        route.parameters.map((parameter) => parameter.name).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      const score = terms.reduce((total, term) => {
        if (haystack.includes(term)) return total + 1;
        return total;
      }, 0);
      return { route, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.route.id.localeCompare(b.route.id))
    .slice(0, limit)
    .map((entry) => entry.route);
}

export function planBookshelfMove(options: { reviewId: string; toShelf: string; user: string }) {
  const user = options.user;
  return {
    dryRun: true,
    mutatesAccount: true,
    method: "POST",
    route: `/review/update_list/${user}`,
    form: {
      authenticity_token: "<from-current-page>",
      view: "table",
      "edit[shelf]": options.toShelf,
      [`reviews[${options.reviewId}]`]: options.reviewId,
    },
    verify: `/review/list/${user}?shelf=${encodeURIComponent(options.toShelf)}`,
    warning: "Do not execute until an approved shelf write-capture pass exists.",
  };
}

export function notesVerifyRoute(options: { bookSlug?: string; userSlug?: string }): string {
  return `/notes/${options.bookSlug ?? "<book-slug>"}/${options.userSlug ?? "<user-slug>"}`;
}

export function planNotesPublicize(options: {
  bookId: string;
  bookSlug?: string;
  userSlug?: string;
}) {
  return {
    dryRun: true,
    mutatesAccount: true,
    method: "PUT",
    route: `/notes/${options.bookId}/share`,
    verifyRouteTemplate: "/notes/{book_slug}/{user_slug}",
    approvedWriteProof: "Only approved for pasted pages from the 2026-05-22 run.",
    verify: notesVerifyRoute({ bookSlug: options.bookSlug, userSlug: options.userSlug }),
    warning:
      "Reload the notes page and verify .js-readingNote[data-visible=true] before claiming success.",
  };
}
