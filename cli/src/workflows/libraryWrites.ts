import { createHash } from "node:crypto";
import {
  buildLiveRequestPlan,
  executeLiveRequest,
  type LiveExecuteOptions,
} from "../client/live.js";
import { envelope, cleanText, loadApiMapRoutes, type GoodreadsRoute } from "../lib.js";
import { emitLiveMutationWarning, riskLevelForRoute } from "../risk.js";
import type { CommandEnvelope } from "../types/index.js";

interface Ck {
  ok: boolean;
  blocker: string | null;
}

function ne(e?: boolean): Ck {
  if (!e) return { ok: false, blocker: "execute=true required" };
  return { ok: true, blocker: null };
}

function na(v: string, a?: string[]): Ck {
  if (!a || a.length === 0) return { ok: false, blocker: "approvedBookId required for execute" };
  if (!a.includes(v)) return { ok: false, blocker: "value not approved" };
  return { ok: true, blocker: null };
}

function gt(...c: Ck[]) {
  return { ok: c.every((x) => x.ok), blockers: c.filter((x) => !x.ok).map((x) => x.blocker!) };
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
): Promise<CommandEnvelope<unknown>> {
  if (!execute) {
    return envelope(
      {
        ...buildLiveRequestPlan(route, { ...options, execute: false, dryRun: true }),
        riskLevel: riskLevelForRoute(route),
        submitted: false,
        verificationRequired,
      },
      { warnings: ["dry-run: pass --execute to send this live write"], confidence: "high" },
    );
  }
  emitLiveMutationWarning(route);
  const result = await executeLiveRequest(route, { ...options, execute: true, dryRun: false });
  return envelope({
    submitted: "requestAccepted" in result ? Boolean(result.requestAccepted) : false,
    result,
    verificationRequired,
  });
}

export interface LSO {
  bookId: string;
  userId?: string;
  includeReviewId?: boolean;
}

export interface SSO {
  bookId: string;
  status: "to-read" | "currently-reading" | "read";
  userId?: string;
  approvedBookId?: string[];
  approvedStatus?: string;
  execute?: boolean;
}

export interface RUO {
  bookId: string;
  action: "set" | "clear";
  rating?: 1 | 2 | 3 | 4 | 5;
  approvedBookId?: string[];
  approvedRating?: 1 | 2 | 3 | 4 | 5;
  execute?: boolean;
}

export interface RVO {
  bookId: string;
  reviewText: string;
  userId?: string;
  approvedBookId?: string[];
  approvedTextSha256?: string;
  execute?: boolean;
}

const EXCLUSIVE = new Set(["to-read", "currently-reading", "read"]);

/** Public RSS membership check — no private highlight text. */
async function shelfContains(userId: string, shelf: string, bookId: string): Promise<boolean> {
  const url = `https://www.goodreads.com/review/list_rss/${encodeURIComponent(userId)}?shelf=${encodeURIComponent(shelf)}`;
  const r = await fetch(url, {
    headers: {
      "user-agent": "goodreads-cli",
      accept: "application/rss+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) return false;
  const xml = await r.text();
  return (
    xml.includes(`<book_id>${bookId}</book_id>`) ||
    xml.includes(`book/show/${bookId}`) ||
    new RegExp(`book_id>${bookId}<`).test(xml)
  );
}

async function ratingFromRss(userId: string, bookId: string): Promise<number | null> {
  for (const shelf of ["read", "currently-reading", "to-read"]) {
    const url = `https://www.goodreads.com/review/list_rss/${encodeURIComponent(userId)}?shelf=${encodeURIComponent(shelf)}`;
    const r = await fetch(url, {
      headers: {
        "user-agent": "goodreads-cli",
        accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) continue;
    const xml = await r.text();
    if (!xml.includes(`<book_id>${bookId}</book_id>`) && !xml.includes(`book/show/${bookId}`)) {
      continue;
    }
    const parts = xml.split("<item>");
    for (const part of parts) {
      if (!(
        part.includes(`<book_id>${bookId}</book_id>`) || part.includes(`book/show/${bookId}`)
      )) {
        continue;
      }
      const m = part.match(/<user_rating>(\d+)<\/user_rating>/i);
      if (m?.[1]) return parseInt(m[1], 10);
    }
  }
  return null;
}

// eslint-disable-next-line complexity -- multi-shelf RSS + optional HTML enrichment
export async function ls(o: LSO): Promise<CommandEnvelope<unknown>> {
  const uid = o.userId || process.env.GOODREADS_USER_ID || "179929687";
  const sources: string[] = [];
  let status = "unknown";
  let rating: number | null = null;
  let reviewExists = false;
  let textLength = 0;
  let textSha256 = "";

  for (const shelf of ["currently-reading", "read", "to-read"] as const) {
    const url = `https://www.goodreads.com/review/list_rss/${encodeURIComponent(uid)}?shelf=${shelf}`;
    sources.push(url);
    try {
      const r = await fetch(url, {
        headers: {
          "user-agent": "goodreads-cli",
          accept: "application/rss+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) continue;
      const xml = await r.text();
      const parts = xml.split("<item>");
      for (const part of parts) {
        if (!(
          part.includes(`<book_id>${o.bookId}</book_id>`) || part.includes(`book/show/${o.bookId}`)
        )) {
          continue;
        }
        status = shelf;
        const rm = part.match(/<user_rating>(\d+)<\/user_rating>/i);
        if (rm?.[1]) rating = parseInt(rm[1], 10);
        const rev =
          part.match(/<user_review><!\[CDATA\[([\s\S]*?)\]\]><\/user_review>/i) ||
          part.match(/<user_review>([\s\S]*?)<\/user_review>/i);
        const revBody = rev?.[1];
        if (revBody && cleanText(revBody)) {
          const text = cleanText(revBody);
          reviewExists = true;
          textLength = text.length;
          textSha256 = createHash("sha256").update(text, "utf8").digest("hex");
        }
        break;
      }
      if (status !== "unknown") break;
    } catch {
      // continue other shelves
    }
  }

  if (process.env.GOODREADS_COOKIE && status === "unknown") {
    const url = `https://www.goodreads.com/review/list/${encodeURIComponent(uid)}?v=2&shelf=read&per_page=100`;
    sources.push(url);
    try {
      const r = await fetch(url, {
        headers: {
          cookie: process.env.GOODREADS_COOKIE || "",
          "user-agent": "goodreads-cli",
          accept: "text/html",
        },
        signal: AbortSignal.timeout(30_000),
      });
      const h = await r.text();
      const es = o.bookId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const sm = h.match(new RegExp("bookShelf-" + es + '"[^>]*>([^<]+)', "i"));
      if (sm) status = cleanText(sm[1]).toLowerCase();
    } catch {
      // ignore
    }
  }

  return envelope({
    bookId: o.bookId,
    userId: uid,
    status,
    rating,
    review: { exists: reviewExists, textLength, textSha256 },
    sources,
  });
}

/**
 * Set exclusive reading status by reusing the live-proven POST /shelf/add_to_shelf path.
 * Exclusive shelves are mutually exclusive on Goodreads; adding to one moves the book.
 */
export async function ss(o: SSO): Promise<CommandEnvelope<unknown>> {
  if (!EXCLUSIVE.has(o.status)) {
    return envelope({ submitted: false, blockers: [`unsupported status: ${o.status}`] });
  }
  if (o.approvedStatus && o.approvedStatus !== o.status) {
    return envelope({ submitted: false, blockers: ["approvedStatus mismatch"] });
  }

  const execute = Boolean(o.execute);
  if (execute) {
    const c = gt(ne(true), na(o.bookId, o.approvedBookId));
    if (!c.ok) return envelope({ submitted: false, blockers: c.blockers });
  }

  const route = await routeBySelector("POST /shelf/add_to_shelf");
  const write = await runWrite(
    route,
    { form: { book_id: o.bookId, name: o.status } },
    execute,
    `Confirm book ${o.bookId} is on exclusive shelf "${o.status}" via RSS/list.`,
  );

  let mutationVerified = false;
  let verifiedStatus: string | null = null;
  if (
    execute &&
    write.data &&
    typeof write.data === "object" &&
    (write.data as { submitted?: boolean }).submitted
  ) {
    const uid = o.userId || process.env.GOODREADS_USER_ID || "179929687";
    await new Promise((r) => setTimeout(r, 800));
    mutationVerified = await shelfContains(uid, o.status, o.bookId);
    verifiedStatus = mutationVerified ? o.status : null;
  }

  return envelope({
    ok: execute ? Boolean((write.data as { submitted?: boolean } | undefined)?.submitted) : true,
    bookId: o.bookId,
    status: o.status,
    transport: "POST /shelf/add_to_shelf",
    implementationStatus: "live",
    write,
    mutationVerified,
    verifiedStatus,
  });
}

/**
 * Rating via mapped Rails POST /review/update/{book_id}.
 * Form fields used by Goodreads shelf UJS variants:
 *   review[rating] = 1..5, or 0 to clear.
 */
export async function ru(o: RUO): Promise<CommandEnvelope<unknown>> {
  const execute = Boolean(o.execute);
  if (o.action === "set") {
    if (!o.rating || o.rating < 1 || o.rating > 5) {
      return envelope({ submitted: false, blockers: ["rating 1-5 required for action=set"] });
    }
    if (execute && o.rating !== o.approvedRating) {
      return envelope({ submitted: false, blockers: ["approvedRating mismatch"] });
    }
  }
  if (execute) {
    const c = gt(ne(true), na(o.bookId, o.approvedBookId));
    if (!c.ok) return envelope({ submitted: false, blockers: c.blockers });
  }

  const stars = o.action === "clear" ? 0 : (o.rating as number);
  const route = await routeBySelector("POST /review/update/{book_id}");
  const form: Record<string, string> = {
    "review[rating]": String(stars),
    rating: String(stars),
  };
  const write = await runWrite(
    route,
    { pathParams: { book_id: o.bookId }, form },
    execute,
    `Confirm rating for book ${o.bookId} via RSS user_rating.`,
  );

  let mutationVerified = false;
  let verifiedRating: number | null = null;
  if (execute && (write.data as { submitted?: boolean } | undefined)?.submitted) {
    const uid = process.env.GOODREADS_USER_ID || "179929687";
    await new Promise((r) => setTimeout(r, 800));
    verifiedRating = await ratingFromRss(uid, o.bookId);
    if (o.action === "clear") mutationVerified = !verifiedRating || verifiedRating === 0;
    else mutationVerified = verifiedRating === o.rating;
  }

  return envelope({
    ok: execute ? Boolean((write.data as { submitted?: boolean } | undefined)?.submitted) : true,
    bookId: o.bookId,
    action: o.action,
    rating: o.action === "clear" ? 0 : o.rating,
    transport: "POST /review/update/{book_id}",
    implementationStatus: "live",
    write,
    mutationVerified,
    verifiedRating,
  });
}

/**
 * Review text via mapped Rails POST /review/update/{book_id}.
 */
export async function rv(o: RVO): Promise<CommandEnvelope<unknown>> {
  const hash = createHash("sha256").update(o.reviewText, "utf8").digest("hex");
  const execute = Boolean(o.execute);
  if (execute) {
    const c = gt(ne(true), na(o.bookId, o.approvedBookId));
    if (!c.ok) {
      return envelope({
        bookId: o.bookId,
        textLength: o.reviewText.length,
        textSha256: hash,
        submitted: false,
        mutationVerified: false,
        verificationRequired: c.blockers.join("; "),
      });
    }
    if (o.approvedTextSha256 && o.approvedTextSha256 !== hash) {
      return envelope({
        bookId: o.bookId,
        textLength: o.reviewText.length,
        textSha256: hash,
        submitted: false,
        mutationVerified: false,
        verificationRequired: "hash mismatch",
      });
    }
  }

  const route = await routeBySelector("POST /review/update/{book_id}");
  const form: Record<string, string> = {
    "review[review]": o.reviewText,
    "review[body]": o.reviewText,
  };
  const write = await runWrite(
    route,
    { pathParams: { book_id: o.bookId }, form },
    execute,
    `Confirm review text length/hash for book ${o.bookId} via independent show/RSS readback.`,
  );

  let mutationVerified = false;
  if (execute && (write.data as { submitted?: boolean } | undefined)?.submitted) {
    await new Promise((r) => setTimeout(r, 800));
    const again = await ls({ bookId: o.bookId, userId: o.userId });
    const data = again.data as { review?: { textSha256?: string; textLength?: number } };
    mutationVerified = Boolean(
      data?.review?.textSha256 === hash || data?.review?.textLength === o.reviewText.length,
    );
  }

  return envelope({
    ok: execute ? Boolean((write.data as { submitted?: boolean } | undefined)?.submitted) : true,
    bookId: o.bookId,
    textLength: o.reviewText.length,
    textSha256: hash,
    transport: "POST /review/update/{book_id}",
    implementationStatus: "live",
    write,
    mutationVerified,
  });
}
