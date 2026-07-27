import { createHash } from "node:crypto";
import { envelope, cleanText } from "../lib.js";
import type { GoodreadsRoute } from "../lib.js";
import type { CommandEnvelope } from "../types/index.js";

interface Ck { ok: boolean; blocker: string | null; }
function ne(e?: boolean, d?: boolean): Ck {
  if (d) return { ok: false, blocker: "dry-run" };
  if (!e) return { ok: false, blocker: "execute=true required" };
  return { ok: true, blocker: null };
}
function nv(n: string): Ck {
  if (!process.env[n]) return { ok: false, blocker: `${n} not set` };
  return { ok: true, blocker: null };
}
function na(v: string, a?: string[]): Ck {
  if (!a || !a.includes(v)) return { ok: false, blocker: "value not approved" };
  return { ok: true, blocker: null };
}
function gt(...c: Ck[]) {
  return { ok: c.every(x => x.ok), blockers: c.filter(x => !x.ok).map(x => x.blocker!) };
}

export interface LSO { bookId: string; userId?: string; includeReviewId?: boolean; }
export interface SSO { bookId: string; status: "to-read" | "currently-reading" | "read"; userId?: string; approvedBookId?: string[]; approvedStatus?: string; execute?: boolean; }
export interface RUO { bookId: string; action: "set" | "clear"; rating?: 1 | 2 | 3 | 4 | 5; approvedBookId?: string[]; approvedRating?: 1 | 2 | 3 | 4 | 5; execute?: boolean; }
export interface RVO { bookId: string; reviewText: string; userId?: string; approvedBookId?: string[]; approvedTextSha256?: string; execute?: boolean; }

export async function ls(o: LSO): Promise<CommandEnvelope<unknown>> {
  const uid = o.userId || process.env.GOODREADS_USER_ID || "179929687";
  const url = `https://www.goodreads.com/review/list/${encodeURIComponent(uid)}?v=2&shelf=read&per_page=100`;
  const r = await fetch(url, { headers: { cookie: process.env.GOODREADS_COOKIE || "", "user-agent": "goodreads-cli", accept: "text/html" }, signal: AbortSignal.timeout(30000) });
  const h = await r.text();
  const es = o.bookId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sm = h.match(new RegExp("bookShelf-" + es + '"[^>]*>([^<]+)', "i"));
  const st = sm ? cleanText(sm[1]).toLowerCase() : (h.match(/exclusive_shelf[^:]*:\s*"([^"]+)"/i)?.[1]?.toLowerCase() || "unknown");
  const rm = h.match(/user_rating["']?\s*[=:]\s*["']?(\d)/i);
  const ra = rm?.[1] ? parseInt(rm[1], 10) : null;
  const rvm = h.match(/user_review["']?\s*[=:]\s*["']([^"']+)/i);
  const rv = rvm?.[1] || null;
  const sh = rv ? createHash("sha256").update(rv, "utf8").digest("hex") : "";
  return envelope({ bookId: o.bookId, userId: uid, status: st, rating: ra, review: { exists: rv !== null, textLength: rv?.length ?? 0, textSha256: sh }, sources: [url] });
}

export async function ss(o: SSO): Promise<CommandEnvelope<unknown>> {
  const c = gt(ne(o.execute), nv("GOODREADS_ALLOW_STATUS_WRITES"), na(o.bookId, o.approvedBookId));
  if (!c.ok) return envelope({ submitted: false, blockers: c.blockers });
  if (o.approvedStatus && o.approvedStatus !== o.status) return envelope({ submitted: false, blockers: ["approvedStatus mismatch"] });
  return envelope({ ok: false, bookId: o.bookId, status: o.status, implementationStatus: "needs_capture", reason: "setStatus ready for executeLiveRequest", mutationVerified: false });
}

export async function ru(o: RUO): Promise<CommandEnvelope<unknown>> {
  const c = gt(ne(o.execute), nv("GOODREADS_ALLOW_RATING_WRITES"), na(o.bookId, o.approvedBookId));
  if (!c.ok) return envelope({ submitted: false, blockers: c.blockers });
  if (o.action === "set" && o.rating !== o.approvedRating) return envelope({ submitted: false, blockers: ["approvedRating mismatch"] });
  return envelope({ ok: false, bookId: o.bookId, action: o.action, implementationStatus: "needs_capture", reason: "rating: needs AppSync capture", mutationVerified: false });
}

export async function rv(o: RVO): Promise<CommandEnvelope<unknown>> {
  const hash = createHash("sha256").update(o.reviewText, "utf8").digest("hex");
  const c = gt(ne(o.execute), nv("GOODREADS_ALLOW_REVIEW_WRITES"), na(o.bookId, o.approvedBookId));
  if (!c.ok) return envelope({ bookId: o.bookId, textLength: o.reviewText.length, textSha256: hash, submitted: false, mutationVerified: false, verificationRequired: c.blockers.join("; ") });
  if (o.approvedTextSha256 && o.approvedTextSha256 !== hash) return envelope({ bookId: o.bookId, textLength: o.reviewText.length, textSha256: hash, submitted: false, mutationVerified: false, verificationRequired: "hash mismatch" });
  return envelope({ ok: false, bookId: o.bookId, textLength: o.reviewText.length, textSha256: hash, implementationStatus: "needs_capture", reason: "review: needs browser capture", mutationVerified: false });
}
