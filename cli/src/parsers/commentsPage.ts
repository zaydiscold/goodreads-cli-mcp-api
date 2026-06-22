import * as cheerio from "cheerio";
import { cleanText } from "../lib.js";

export interface CommentsPageParse {
  kind: "comments_page";
  title: string | null;
  commentLinkCount: number;
  commentLinks: Array<{ href: string; labelLength: number }>;
  forms: Array<{ method: string; action: string; inputNames: string[] }>;
}

// Parse a Goodreads comments / recent-post page into redacted metadata.
// Deliberately emits only link/form *shape* (hrefs, label lengths, input
// names) and never raw comment bodies.
export function parseCommentsPage(html: string): CommentsPageParse {
  const $ = cheerio.load(html);
  const commentLinks: Array<{ href: string; labelLength: number }> = [];
  $("a[href*='/comment/'], a[href*='comment_id=']").each((_, element) => {
    const href = $(element).attr("href");
    const label = cleanText($(element).text());
    if (!href) return;
    commentLinks.push({ href, labelLength: label.length });
  });
  const forms: Array<{ method: string; action: string; inputNames: string[] }> = [];
  $("form").each((_, element) => {
    const form = $(element);
    const action = form.attr("action") ?? "";
    if (!/comment/i.test(action)) return;
    forms.push({
      method: (form.attr("method") ?? "GET").toUpperCase(),
      action,
      inputNames: form
        .find("input, textarea, select")
        .map((__, input) => $(input).attr("name"))
        .get()
        .filter((name): name is string => Boolean(name)),
    });
  });
  return {
    kind: "comments_page",
    title: cleanText($("title").first().text()) || null,
    commentLinkCount: commentLinks.length,
    commentLinks,
    forms,
  };
}
