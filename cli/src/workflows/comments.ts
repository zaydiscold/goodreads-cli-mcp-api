import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { fetchAuthenticatedText } from "../client/http.js";
import { executeLiveRequest } from "../client/live.js";
import { cleanText, envelope, loadApiMapRoutes } from "../lib.js";

export interface CommentCreateOptions {
  reviewId: string;
  text: string;
  approvedReviewId?: string;
  approvedTextSha256?: string;
  execute?: boolean;
}

function contentHash(text: string): string {
  return createHash("sha256").update(cleanText(text), "utf8").digest("hex");
}

/** Create on an exact review only after inspecting its current owned-session form. */
export async function commentCreate(options: CommentCreateOptions) {
  if (!/^\d+$/.test(options.reviewId)) throw new Error("reviewId must be numeric");
  if (!options.text.trim()) throw new Error("Comment text is required");
  const textSha256 = contentHash(options.text);
  const preview = {
    reviewId: options.reviewId,
    textLength: options.text.length,
    textSha256,
    submitted: false,
    mutationVerified: false,
    outcome: "planned",
  };
  if (!options.execute) return envelope(preview);
  if (options.approvedReviewId !== options.reviewId || options.approvedTextSha256 !== textSha256) {
    return envelope({
      ...preview,
      outcome: "blocked",
      blockers: ["Exact review and text hash approval required"],
    });
  }
  const target = `https://www.goodreads.com/review/show/${options.reviewId}`;
  const before = await fetchAuthenticatedText(target);
  if (before.signedOut) throw new Error("Authenticated review page is required");
  const $ = cheerio.load(before.html);
  const form = $("form")
    .filter((_, el) => {
      try {
        const action = new URL($(el).attr("action") ?? "", target);
        return action.origin === "https://www.goodreads.com" && action.pathname === "/comment";
      } catch {
        return false;
      }
    })
    .filter(
      (_, el) =>
        $(el).find('input[name="id"]').val() === options.reviewId &&
        $(el).find('input[name="type"]').val() === "review",
    )
    .first();
  if (!form.find('textarea[name="comment[body_usertext]"]').length) {
    throw new Error("Exact review comment form was not observed; nothing submitted");
  }
  const route = (await loadApiMapRoutes()).find(
    (r) => r.method === "POST" && r.path === "/comment",
  );
  if (!route) throw new Error("Comment route is unavailable");
  const result = await executeLiveRequest(route, {
    execute: true,
    form: {
      type: "review",
      id: options.reviewId,
      "comment[body_usertext]": options.text,
      update_feed: "0",
    },
  });
  const submitted = "requestAccepted" in result && result.requestAccepted;
  // The form contract is captured. Exact comment-record readback still needs live evidence.
  // Never convert transport acceptance into a claim that a public comment was persisted.
  return envelope({
    ...preview,
    submitted,
    outcome: submitted ? "submitted_unverified" : "rejected",
    transport: { requestAccepted: Boolean(submitted), mutationVerified: false },
    verificationRequired:
      "Read the exact review and confirm the new comment before reporting completion. Do not retry an uncertain submission.",
    retrySafe: false,
  });
}
