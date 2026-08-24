import { createHash } from "node:crypto";
import {
  buildLiveRequestPlan,
  executeLiveRequest,
  type LiveExecuteOptions,
} from "../client/live.js";
import {
  encodeGoodreadsPathSegment,
  fetchAuthenticatedText,
  fetchPublicText,
} from "../client/http.js";
import { envelope, cleanText, loadApiMapRoutes, type GoodreadsRoute } from "../lib.js";
import { emitLiveMutationWarning, riskLevelForRoute } from "../risk.js";
import type { CommandEnvelope, Confidence } from "../types/index.js";

interface Check {
  ok: boolean;
  blocker: string | null;
}

function executionRequested(execute?: boolean): Check {
  return execute
    ? { ok: true, blocker: null }
    : { ok: false, blocker: "execute=true required" };
}

function approvedBook(value: string, approved?: string[]): Check {
  if (!approved?.length) {
    return { ok: false, blocker: "approvedBookId required for execute" };
  }
  return approved.includes(value)
    ? { ok: true, blocker: null }
    : { ok: false, blocker: "book id is not approved" };
}

function checks(...values: Check[]) {
  return {
    ok: values.every((value) => value.ok),
    blockers: values.filter((value) => !value.ok).map((value) => value.blocker!),
  };
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
        outcome: "planned",
        verificationRequired,
      },
      { warnings: ["dry-run: pass execute=true with exact approvals to send this write"] },
    );
  }
  emitLiveMutationWarning(route);
  const result = await executeLiveRequest(route, { ...options, execute: true, dryRun: false });
  const submitted = "requestAccepted" in result ? Boolean(result.requestAccepted) : false;
  return envelope({
    submitted,
    outcome: submitted ? "submitted" : "rejected",
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

export interface LibraryEditState {
  reviewId: string | null;
  status: string | null;
  rating: number | null;
  reviewText: string;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? match;
  });
}

function canonicalReviewText(value: string): string {
  return cleanText(decodeHtmlEntities(value));
}

function reviewHash(value: string): string {
  return createHash("sha256").update(canonicalReviewText(value), "utf8").digest("hex");
}

/** Parse immediate account state from authenticated `/review/edit/{book_id}` HTML. */
export function parseLibraryEditState(html: string): LibraryEditState {
  const chosen = html.match(/chosen:\s*\[([^\]]*)\]/i)?.[1] ?? "";
  const chosenShelves = [...chosen.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]!);
  const exclusive = chosenShelves.find((shelf) => EXCLUSIVE.has(shelf));
  const shelfLink = html.match(
    /class=["']shelfLink["'][^>]*href=["'][^"']*[?&]shelf=([^"'&]+)/i,
  )?.[1];
  const ratingRaw = html.match(/data-rating=["']([0-5](?:\.\d+)?)["']/i)?.[1];
  const reviewRaw =
    html.match(/<textarea[^>]*name=["']review\[review\]["'][^>]*>([\s\S]*?)<\/textarea>/i)?.[1] ??
    html.match(
      /<textarea[^>]*id=["']review_review_usertext["'][^>]*>([\s\S]*?)<\/textarea>/i,
    )?.[1] ??
    "";
  const reviewId =
    html.match(/\/review\/(?:show|edit|update)\/(\d+)/i)?.[1] ??
    html.match(/review[_-]id["']?\s*[:=]\s*["']?(\d+)/i)?.[1] ??
    null;
  return {
    reviewId,
    status: exclusive ?? shelfLink ?? null,
    rating: ratingRaw === undefined ? null : Number(ratingRaw),
    reviewText: canonicalReviewText(reviewRaw),
  };
}

function validateBookId(bookId: string): string {
  const value = bookId.trim();
  if (!/^\d+$/.test(value)) throw new Error("bookId must be numeric");
  return value;
}

export async function ls(options: LSO): Promise<CommandEnvelope<unknown>> {
  const bookId = validateBookId(options.bookId);
  const userId = options.userId?.trim() || process.env.GOODREADS_USER_ID?.trim() || null;
  const authenticated = Boolean(process.env.GOODREADS_COOKIE?.trim());
  if (!userId && !authenticated) {
    throw new Error(
      "library show requires userId/GOODREADS_USER_ID for public RSS or GOODREADS_COOKIE for an authenticated read",
    );
  }

  const sources: string[] = [];
  const sourceResults: Array<{
    source: "rss" | "authenticated-edit";
    target: string;
    ok: boolean;
    signedOut?: boolean;
  }> = [];
  const warnings: string[] = [];
  let status = "unknown";
  let rating: number | null = null;
  let reviewId: string | null = null;
  let reviewText = "";
  let authenticatedSuccess = false;
  let rssSuccessCount = 0;

  if (userId) {
    const encodedUser = encodeGoodreadsPathSegment(userId, "userId");
    for (const shelf of ["currently-reading", "read", "to-read"] as const) {
      const url = `https://www.goodreads.com/review/list_rss/${encodedUser}?shelf=${shelf}`;
      sources.push(url);
      try {
        const xml = await fetchPublicText(url);
        rssSuccessCount += 1;
        sourceResults.push({ source: "rss", target: shelf, ok: true });
        const item = xml
          .split("<item>")
          .find(
            (part) =>
              part.includes(`<book_id>${bookId}</book_id>`) ||
              part.includes(`book/show/${bookId}`),
          );
        if (!item) continue;
        status = shelf;
        const ratingMatch = item.match(/<user_rating>(\d+(?:\.\d+)?)<\/user_rating>/i);
        if (ratingMatch?.[1]) rating = Number(ratingMatch[1]);
        const reviewMatch =
          item.match(/<user_review><!\[CDATA\[([\s\S]*?)\]\]><\/user_review>/i) ||
          item.match(/<user_review>([\s\S]*?)<\/user_review>/i);
        reviewText = canonicalReviewText(reviewMatch?.[1] ?? "");
        break;
      } catch {
        sourceResults.push({ source: "rss", target: shelf, ok: false });
        warnings.push(`RSS lookup for shelf '${shelf}' failed.`);
      }
    }
  }

  if (authenticated) {
    const url = `https://www.goodreads.com/review/edit/${encodeGoodreadsPathSegment(bookId, "bookId")}`;
    sources.push(url);
    try {
      const result = await fetchAuthenticatedText(url);
      sourceResults.push({
        source: "authenticated-edit",
        target: "/review/edit/{book_id}",
        ok: !result.signedOut,
        signedOut: result.signedOut,
      });
      if (result.signedOut) {
        warnings.push("Authenticated library read resolved to the Goodreads sign-in page.");
      } else {
        authenticatedSuccess = true;
        const immediate = parseLibraryEditState(result.html);
        reviewId = immediate.reviewId;
        if (immediate.status) status = immediate.status;
        if (immediate.rating !== null) rating = immediate.rating;
        reviewText = immediate.reviewText;
      }
    } catch {
      sourceResults.push({
        source: "authenticated-edit",
        target: "/review/edit/{book_id}",
        ok: false,
      });
      warnings.push("Authenticated library edit-page lookup failed.");
    }
  }

  const anySuccess = authenticatedSuccess || rssSuccessCount > 0;
  const confidence: Confidence = authenticatedSuccess
    ? "high"
    : rssSuccessCount > 0
      ? status === "unknown"
        ? "medium"
        : "high"
      : "low";
  if (!anySuccess) warnings.push("No library-state source succeeded; returned state is indeterminate.");

  const canonicalHash = reviewText ? reviewHash(reviewText) : "";
  return envelope(
    {
      bookId,
      userId,
      status,
      rating,
      ...(options.includeReviewId ? { reviewId } : {}),
      review: {
        exists: Boolean(reviewText),
        textLength: reviewText.length,
        textSha256: canonicalHash,
        canonicalization: "HTML entities decoded; whitespace collapsed and trimmed",
      },
      sources,
      sourceResults,
      evidence: {
        authenticatedSuccess,
        rssSuccessCount,
        stateObserved: anySuccess,
      },
    },
    { warnings, confidence },
  );
}

export async function ss(options: SSO): Promise<CommandEnvelope<unknown>> {
  const bookId = validateBookId(options.bookId);
  if (!EXCLUSIVE.has(options.status)) {
    return envelope({ submitted: false, outcome: "blocked", blockers: [`unsupported status: ${options.status}`] });
  }
  const execute = Boolean(options.execute);
  if (execute && !options.approvedStatus) {
    return envelope({ submitted: false, outcome: "blocked", blockers: ["approvedStatus required for execute"] });
  }
  if (execute && options.approvedStatus !== options.status) {
    return envelope({ submitted: false, outcome: "blocked", blockers: ["approvedStatus mismatch"] });
  }
  if (execute) {
    const result = checks(executionRequested(true), approvedBook(bookId, options.approvedBookId));
    if (!result.ok) return envelope({ submitted: false, outcome: "blocked", blockers: result.blockers });
  }

  const route = await routeBySelector("POST /shelf/add_to_shelf");
  const write = await runWrite(
    route,
    { form: { book_id: bookId, name: options.status } },
    execute,
    `Confirm book ${bookId} is on exclusive shelf "${options.status}".`,
  );
  let mutationVerified = false;
  let verifiedStatus: string | null = null;
  if (execute && (write.data as { submitted?: boolean } | undefined)?.submitted) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const again = await ls({ bookId, userId: options.userId });
    verifiedStatus = (again.data as { status?: string }).status ?? null;
    mutationVerified = verifiedStatus === options.status;
  }
  return envelope({
    ok: execute ? mutationVerified : true,
    outcome: execute ? (mutationVerified ? "verified" : "indeterminate") : "planned",
    bookId,
    status: options.status,
    transport: "POST /shelf/add_to_shelf",
    implementationStatus: "live",
    write,
    mutationVerified,
    verifiedStatus,
  });
}

export async function ru(options: RUO): Promise<CommandEnvelope<unknown>> {
  const bookId = validateBookId(options.bookId);
  const execute = Boolean(options.execute);
  if (options.action === "set") {
    if (!options.rating || options.rating < 1 || options.rating > 5) {
      return envelope({ submitted: false, outcome: "blocked", blockers: ["rating 1-5 required for action=set"] });
    }
    if (execute && options.rating !== options.approvedRating) {
      return envelope({ submitted: false, outcome: "blocked", blockers: ["approvedRating mismatch"] });
    }
  }
  if (execute) {
    const result = checks(executionRequested(true), approvedBook(bookId, options.approvedBookId));
    if (!result.ok) return envelope({ submitted: false, outcome: "blocked", blockers: result.blockers });
  }

  const stars = options.action === "clear" ? 0 : (options.rating as number);
  const route = await routeBySelector("POST /review/rate/{book_id}");
  const write = await runWrite(
    route,
    {
      pathParams: { book_id: bookId },
      query: { redirect_edit: "true", shelf: "all", stars_click: "true" },
      form: { format: "json", rating: String(stars) },
    },
    execute,
    `Confirm rating for book ${bookId} through authenticated readback.`,
  );
  let mutationVerified = false;
  let verifiedRating: number | null = null;
  if (execute && (write.data as { submitted?: boolean } | undefined)?.submitted) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const again = await ls({ bookId });
    verifiedRating = (again.data as { rating?: number | null }).rating ?? null;
    mutationVerified =
      options.action === "clear"
        ? verifiedRating === null || verifiedRating === 0
        : verifiedRating === options.rating;
  }
  return envelope({
    ok: execute ? mutationVerified : true,
    outcome: execute ? (mutationVerified ? "verified" : "indeterminate") : "planned",
    bookId,
    action: options.action,
    rating: stars,
    transport: "POST /review/rate/{book_id}",
    implementationStatus: "live",
    write,
    mutationVerified,
    verifiedRating,
  });
}

export async function rv(options: RVO): Promise<CommandEnvelope<unknown>> {
  const bookId = validateBookId(options.bookId);
  const canonicalText = canonicalReviewText(options.reviewText);
  const hash = reviewHash(canonicalText);
  const execute = Boolean(options.execute);
  if (execute) {
    const result = checks(executionRequested(true), approvedBook(bookId, options.approvedBookId));
    if (!result.ok) {
      return envelope({
        bookId,
        textLength: canonicalText.length,
        textSha256: hash,
        submitted: false,
        outcome: "blocked",
        mutationVerified: false,
        blockers: result.blockers,
      });
    }
    if (!options.approvedTextSha256) {
      return envelope({
        bookId,
        textLength: canonicalText.length,
        textSha256: hash,
        submitted: false,
        outcome: "blocked",
        mutationVerified: false,
        blockers: ["approvedTextSha256 required for execute"],
      });
    }
    if (options.approvedTextSha256 !== hash) {
      return envelope({
        bookId,
        textLength: canonicalText.length,
        textSha256: hash,
        submitted: false,
        outcome: "blocked",
        mutationVerified: false,
        blockers: ["approvedTextSha256 mismatch"],
      });
    }
  }

  const route = await routeBySelector("POST /review/update/{book_id}");
  const write = await runWrite(
    route,
    {
      pathParams: { book_id: bookId },
      form: {
        utf8: "✓",
        "review[review]": options.reviewText,
        "review[spoiler_flag]": "0",
        "review[sell_flag]": "0",
        next: "Post",
        source: "form",
      },
    },
    execute,
    `Confirm the canonical review hash for book ${bookId} through authenticated readback.`,
  );
  let mutationVerified = false;
  let verifiedHash = "";
  let verifiedExists = false;
  if (execute && (write.data as { submitted?: boolean } | undefined)?.submitted) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const again = await ls({ bookId, userId: options.userId });
    const review = (again.data as {
      review?: { exists?: boolean; textSha256?: string };
    }).review;
    verifiedExists = Boolean(review?.exists);
    verifiedHash = review?.textSha256 ?? "";
    mutationVerified = canonicalText
      ? verifiedExists && verifiedHash === hash
      : !verifiedExists && verifiedHash === "";
  }
  return envelope({
    ok: execute ? mutationVerified : true,
    outcome: execute ? (mutationVerified ? "verified" : "indeterminate") : "planned",
    bookId,
    textLength: canonicalText.length,
    textSha256: hash,
    canonicalization: "HTML entities decoded; whitespace collapsed and trimmed",
    transport: "POST /review/update/{book_id}",
    implementationStatus: "live",
    write,
    mutationVerified,
    verifiedTextSha256: verifiedHash,
    verifiedExists,
  });
}
