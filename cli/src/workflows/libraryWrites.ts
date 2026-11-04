import * as cheerio from "cheerio";
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
import { parseShelfWidget, shelfWidgetPath } from "../parsers/widget.js";
import { envelope, cleanText, loadApiMapRoutes, type GoodreadsRoute } from "../lib.js";
import { emitLiveMutationWarning, riskLevelForRoute } from "../risk.js";
import type { CommandEnvelope, Confidence } from "../types/index.js";

interface Check {
  ok: boolean;
  blocker: string | null;
}

function executionRequested(execute?: boolean): Check {
  return execute ? { ok: true, blocker: null } : { ok: false, blocker: "execute=true required" };
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
  mode?: "replace" | "append";
  approvedPreviousTextSha256?: string;
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
  reviewObserved: boolean;
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
    html.match(/\/review\/show\/(\d+)/i)?.[1] ??
    html.match(/review[_-]id["']?\s*[:=]\s*["']?(\d+)/i)?.[1] ??
    null;
  return {
    reviewId,
    status: exclusive ?? shelfLink ?? null,
    rating: ratingRaw === undefined ? null : Number(ratingRaw),
    reviewText: canonicalReviewText(reviewRaw),
    reviewObserved:
      /<textarea[^>]*(?:name=["']review\[review\]["']|id=["']review_review_usertext["'])/i.test(
        html,
      ),
  };
}

/** Concatenate the React Server Components payload Next.js inlines as self.__next_f.push chunks. */
function nextFlightText(html: string): string {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)]
    .map((match) => {
      try {
        return JSON.parse(`"${match[1] ?? ""}"`) as string;
      } catch {
        return "";
      }
    })
    .join("");
}

/** Parse the JSON object that starts at `start` (a "{"), honouring strings and escapes. */
function jsonObjectAt(text: string, start: number): unknown {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

type FlightShelving = {
  book?: { id?: string; legacyId?: number };
  shelf?: { name?: string } | null;
  review?: { rating?: number; text?: string | null } | null;
};

/**
 * Read library state from the redesigned edit page (Next.js app router, since
 * about 2026-11). The old Rails form is gone; the viewer's shelving for the
 * book ships in the inlined flight payload instead. The shelving is only
 * trusted when its book is the exact requested book id. The numeric review id
 * is not present in this layout.
 */
export function parseLibraryEditFlight(html: string, bookId: string): LibraryEditState | null {
  const flight = nextFlightText(html);
  const listAt = flight.indexOf('"viewerShelvings":[');
  const oneAt = flight.indexOf('"viewerShelving":{');
  if (listAt < 0 || oneAt < 0) return null;
  const list = jsonObjectAt(flight, flight.indexOf("[", listAt));
  const shelving = jsonObjectAt(flight, flight.indexOf("{", oneAt)) as FlightShelving | null;
  if (!Array.isArray(list) || !shelving) return null;
  const match = (list as FlightShelving[]).find(
    (entry) => String(entry?.book?.legacyId ?? "") === bookId,
  );
  const kcaId = match?.book?.id;
  if (!kcaId || shelving.book?.id !== kcaId) return null;
  const shelf = shelving.shelf?.name ?? null;
  const review = shelving.review ?? null;
  const rating = review && typeof review.rating === "number" ? review.rating : 0;
  return {
    reviewId: null,
    status: shelf && EXCLUSIVE.has(shelf) ? shelf : null,
    rating,
    reviewText: canonicalReviewText(review?.text ?? ""),
    reviewObserved: true,
  };
}

function validateBookId(bookId: string): string {
  const value = bookId.trim();
  if (!/^\d+$/.test(value)) throw new Error("bookId must be numeric");
  return value;
}

type SourceResult = {
  source: "widget" | "authenticated-edit";
  target: string;
  ok: boolean;
  signedOut?: boolean;
};

type LibraryObservation = {
  status: string;
  rating: number | null;
  reviewId: string | null;
  reviewText: string;
  sources: string[];
  sourceResults: SourceResult[];
  warnings: string[];
  authenticatedSuccess: boolean;
  ratingObserved: boolean;
  reviewObserved: boolean;
  publicSuccessCount: number;
};

function emptyObservation(): LibraryObservation {
  return {
    status: "unknown",
    rating: null,
    reviewId: null,
    reviewText: "",
    sources: [],
    sourceResults: [],
    warnings: [],
    authenticatedSuccess: false,
    ratingObserved: false,
    reviewObserved: false,
    publicSuccessCount: 0,
  };
}

// Public path: Goodreads retired shelf RSS around 2026-10-28, so scan the
// public shelf widgets. They carry shelf status and star rating but never
// review text, and stop at the newest 100 books per shelf.
async function observeWidget(userId: string, bookId: string, state: LibraryObservation) {
  for (const shelf of ["currently-reading", "read", "to-read"] as const) {
    const url = `https://www.goodreads.com${shelfWidgetPath(userId, shelf)}`;
    state.sources.push(url.replace(/&widget_id=\d+/, ""));
    try {
      const widget = parseShelfWidget(await fetchPublicText(url), { user: userId, shelf });
      state.publicSuccessCount += 1;
      state.sourceResults.push({ source: "widget", target: shelf, ok: true });
      const hit = widget.items.find((item) => item.bookId === bookId);
      if (hit) {
        state.status = shelf;
        state.rating = hit.userRating;
        return;
      }
      if (widget.signals.widgetMayCapAt100) {
        state.warnings.push(
          `Public '${shelf}' widget is capped at 100 books; the book may be further down.`,
        );
      }
    } catch {
      state.sourceResults.push({ source: "widget", target: shelf, ok: false });
      state.warnings.push(`Public shelf widget lookup for '${shelf}' failed.`);
    }
  }
}

async function observeAuthenticated(bookId: string, state: LibraryObservation) {
  const url = `https://www.goodreads.com/review/edit/${encodeGoodreadsPathSegment(bookId, "bookId")}`;
  state.sources.push(url);
  try {
    const result = await fetchAuthenticatedText(url);
    state.sourceResults.push({
      source: "authenticated-edit",
      target: "/review/edit/{book_id}",
      ok: !result.signedOut,
      signedOut: result.signedOut,
    });
    if (result.signedOut) {
      state.warnings.push("Authenticated library read resolved to the Goodreads sign-in page.");
      return;
    }
    const $ = cheerio.load(result.html);
    const form = $("form")
      .filter((_, element) => {
        const action = $(element).attr("action") ?? "";
        try {
          const url = new URL(action, "https://www.goodreads.com");
          return (
            url.origin === "https://www.goodreads.com" &&
            url.pathname === `/review/update/${bookId}`
          );
        } catch {
          return false;
        }
      })
      .first();
    const parsed = form.length
      ? parseLibraryEditState(form.html() ?? "")
      : parseLibraryEditFlight(result.html, bookId);
    if (!parsed) {
      state.sourceResults[state.sourceResults.length - 1]!.ok = false;
      state.warnings.push("Exact book review state was not observed; state is indeterminate.");
      return;
    }
    state.authenticatedSuccess = true;
    state.ratingObserved = parsed.rating !== null;
    state.reviewObserved = parsed.reviewObserved;
    state.reviewId = parsed.reviewId;
    if (parsed.status) state.status = parsed.status;
    if (parsed.rating !== null) state.rating = parsed.rating;
    state.reviewText = parsed.reviewText;
  } catch {
    state.sourceResults.push({
      source: "authenticated-edit",
      target: "/review/edit/{book_id}",
      ok: false,
    });
    state.warnings.push("Authenticated library edit-page lookup failed.");
  }
}

function observationConfidence(state: LibraryObservation): Confidence {
  if (state.authenticatedSuccess) return "high";
  if (state.publicSuccessCount === 0) return "low";
  return state.status === "unknown" ? "medium" : "high";
}

function observationData(
  bookId: string,
  userId: string | null,
  includeReviewId: boolean,
  state: LibraryObservation,
) {
  const textSha256 = state.reviewText ? reviewHash(state.reviewText) : "";
  return {
    bookId,
    userId,
    status: state.status,
    rating: state.rating,
    ...(includeReviewId ? { reviewId: state.reviewId } : {}),
    review: {
      exists: Boolean(state.reviewText),
      textLength: state.reviewText.length,
      textSha256,
      canonicalization: "HTML entities decoded; whitespace collapsed and trimmed",
    },
    sources: state.sources,
    sourceResults: state.sourceResults,
    evidence: {
      authenticatedSuccess: state.authenticatedSuccess,
      ratingObserved: state.ratingObserved,
      reviewObserved: state.reviewObserved,
      publicSuccessCount: state.publicSuccessCount,
      stateObserved: state.authenticatedSuccess || state.publicSuccessCount > 0,
    },
  };
}

export async function ls(options: LSO): Promise<CommandEnvelope<unknown>> {
  const bookId = validateBookId(options.bookId);
  const userId = options.userId?.trim() || process.env.GOODREADS_USER_ID?.trim() || null;
  const authenticated = Boolean(process.env.GOODREADS_COOKIE?.trim());
  if (!userId && !authenticated) {
    throw new Error(
      "library show requires userId/GOODREADS_USER_ID for the public shelf widget or GOODREADS_COOKIE for an authenticated read",
    );
  }
  const state = emptyObservation();
  if (userId) await observeWidget(userId, bookId, state);
  if (authenticated && !options.userId) await observeAuthenticated(bookId, state);
  if (!state.authenticatedSuccess && state.publicSuccessCount === 0) {
    state.warnings.push("No library-state source succeeded; returned state is indeterminate.");
  }
  return envelope(observationData(bookId, userId, Boolean(options.includeReviewId), state), {
    warnings: state.warnings,
    confidence: observationConfidence(state),
  });
}

function hasAuthenticatedEvidence(result: CommandEnvelope<unknown>): boolean {
  return (
    (result.data as { evidence?: { authenticatedSuccess?: boolean } }).evidence
      ?.authenticatedSuccess === true
  );
}

export async function ss(options: SSO): Promise<CommandEnvelope<unknown>> {
  const bookId = validateBookId(options.bookId);
  if (!EXCLUSIVE.has(options.status)) {
    return envelope({
      submitted: false,
      outcome: "blocked",
      blockers: [`unsupported status: ${options.status}`],
    });
  }
  const execute = Boolean(options.execute);
  if (execute && !options.approvedStatus) {
    return envelope({
      submitted: false,
      outcome: "blocked",
      blockers: ["approvedStatus required for execute"],
    });
  }
  if (execute && options.approvedStatus !== options.status) {
    return envelope({
      submitted: false,
      outcome: "blocked",
      blockers: ["approvedStatus mismatch"],
    });
  }
  if (execute) {
    const result = checks(executionRequested(true), approvedBook(bookId, options.approvedBookId));
    if (!result.ok)
      return envelope({ submitted: false, outcome: "blocked", blockers: result.blockers });
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
    const again = await ls({ bookId });
    verifiedStatus = (again.data as { status?: string }).status ?? null;
    mutationVerified = hasAuthenticatedEvidence(again) && verifiedStatus === options.status;
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

function validateRatingIntent(options: RUO): CommandEnvelope<unknown> | undefined {
  if (!["set", "clear"].includes(options.action)) throw new Error("action must be set or clear");
  if (options.action === "set") {
    if (
      !Number.isInteger(options.rating) ||
      !options.rating ||
      options.rating < 1 ||
      options.rating > 5
    ) {
      return envelope({
        submitted: false,
        outcome: "blocked",
        blockers: ["rating 1-5 required for action=set"],
      });
    }
    if (options.execute && options.rating !== options.approvedRating) {
      return envelope({
        submitted: false,
        outcome: "blocked",
        blockers: ["approvedRating mismatch"],
      });
    }
  }
  return undefined;
}

export async function ru(options: RUO): Promise<CommandEnvelope<unknown>> {
  const bookId = validateBookId(options.bookId);
  const execute = Boolean(options.execute);
  const invalid = validateRatingIntent(options);
  if (invalid) return invalid;
  if (execute) {
    const result = checks(executionRequested(true), approvedBook(bookId, options.approvedBookId));
    if (!result.ok)
      return envelope({ submitted: false, outcome: "blocked", blockers: result.blockers });
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
    const observed = (again.data as { evidence?: { ratingObserved?: boolean } }).evidence
      ?.ratingObserved;
    mutationVerified =
      Boolean(observed) &&
      (options.action === "clear" ? verifiedRating === 0 : verifiedRating === options.rating);
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

function reviewApprovalBlockers(options: RVO, bookId: string, hash: string): string[] {
  const result = checks(executionRequested(true), approvedBook(bookId, options.approvedBookId));
  if (!result.ok) return result.blockers;
  if (!options.approvedTextSha256) return ["approvedTextSha256 required for execute"];
  if (options.approvedTextSha256 !== hash) return ["approvedTextSha256 mismatch"];
  return [];
}

function blockedReview(bookId: string, textLength: number, hash: string, blockers: string[]) {
  return envelope({
    ok: false,
    bookId,
    textLength,
    textSha256: hash,
    submitted: false,
    outcome: "blocked",
    mutationVerified: false,
    blockers,
  });
}

async function verifyReviewWrite(bookId: string, canonicalText: string, hash: string) {
  await new Promise((resolve) => setTimeout(resolve, 800));
  const again = await ls({ bookId });
  const review = (
    again.data as {
      review?: { exists?: boolean; textSha256?: string };
    }
  ).review;
  const observed = (again.data as { evidence?: { reviewObserved?: boolean } }).evidence
    ?.reviewObserved;
  const exists = Boolean(review?.exists);
  const verifiedHash = review?.textSha256 ?? "";
  return {
    mutationVerified:
      Boolean(observed) &&
      (canonicalText ? exists && verifiedHash === hash : !exists && verifiedHash === ""),
    verifiedHash,
    exists,
  };
}

async function reviewFormDraft(options: RVO, bookId: string) {
  const page = await fetchAuthenticatedText(`https://www.goodreads.com/review/edit/${bookId}`);
  if (page.signedOut) throw new Error("Authenticated review read is required for append");
  const $ = cheerio.load(page.html);
  const form = $("form")
    .filter((_, el) => {
      try {
        const action = new URL($(el).attr("action") ?? "", "https://www.goodreads.com");
        return (
          action.origin === "https://www.goodreads.com" &&
          action.pathname === `/review/update/${bookId}`
        );
      } catch {
        return false;
      }
    })
    .first();
  const field = form.find('textarea[name="review[review]"]');
  if (!field.length) throw new Error("Exact existing review form is required for append");
  const previous = field.text();
  const previousTextSha256 = reviewHash(previous);
  if (
    options.mode === "append" &&
    options.execute &&
    options.approvedPreviousTextSha256 !== previousTextSha256
  ) {
    throw new Error(
      "Existing review changed or approvedPreviousTextSha256 is missing; preview again",
    );
  }
  const text =
    options.mode === "append"
      ? previous + (previous ? "\n\n" : "") + options.reviewText
      : options.reviewText;
  const preserved: Record<string, string> = {};
  form.find("input[name],textarea[name],select[name]").each((_, element) => {
    const control = $(element);
    const name = control.attr("name")!;
    const type = control.attr("type") ?? "";
    if (
      ["authenticity_token", "add_update", "add_to_blog"].includes(name) ||
      ["submit", "button", "file"].includes(type) ||
      (["checkbox", "radio"].includes(type) && !control.is(":checked"))
    )
      return;
    const value = control.val();
    if (typeof value === "string") preserved[name] = value;
  });
  return { text, previousTextSha256, preserved };
}

export async function rv(options: RVO): Promise<CommandEnvelope<unknown>> {
  const bookId = validateBookId(options.bookId);
  if (options.mode && !["replace", "append"].includes(options.mode))
    throw new Error("mode must be replace or append");
  let draft = options.mode === "append" ? await reviewFormDraft(options, bookId) : undefined;
  const text = draft?.text ?? options.reviewText;
  const canonicalText = canonicalReviewText(text);
  const hash = reviewHash(canonicalText);
  const execute = Boolean(options.execute);
  if (execute) {
    const blockers = reviewApprovalBlockers(options, bookId, hash);
    if (blockers.length) return blockedReview(bookId, canonicalText.length, hash, blockers);
    if (!draft) {
      try {
        draft = await reviewFormDraft(options, bookId);
      } catch {
        return blockedReview(bookId, canonicalText.length, hash, [
          "Exact existing review form is required to preserve review settings",
        ]);
      }
    }
  }

  const route = await routeBySelector("POST /review/update/{book_id}");
  const write = await runWrite(
    route,
    {
      pathParams: { book_id: bookId },
      form: {
        ...draft?.preserved,
        utf8: "✓",
        "review[review]": text,
        next: "Post",
        source: "form",
      },
    },
    execute,
    `Confirm the canonical review hash for book ${bookId} through authenticated readback.`,
  );
  const submitted = Boolean((write.data as { submitted?: boolean } | undefined)?.submitted);
  const verification =
    execute && submitted
      ? await verifyReviewWrite(bookId, canonicalText, hash)
      : { mutationVerified: false, verifiedHash: "", exists: false };
  return envelope({
    ok: execute ? verification.mutationVerified : true,
    outcome: execute ? (verification.mutationVerified ? "verified" : "indeterminate") : "planned",
    bookId,
    textLength: canonicalText.length,
    textSha256: hash,
    mode: options.mode ?? "replace",
    ...(draft ? { previousTextSha256: draft.previousTextSha256 } : {}),
    canonicalization: "HTML entities decoded; whitespace collapsed and trimmed",
    transport: "POST /review/update/{book_id}",
    implementationStatus: "live",
    write,
    mutationVerified: verification.mutationVerified,
    verifiedTextSha256: verification.verifiedHash,
    verifiedExists: verification.exists,
  });
}
