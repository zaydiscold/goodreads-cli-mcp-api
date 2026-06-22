import * as cheerio from "cheerio";
import { cleanText } from "../lib.js";
import type { MessagePageParse } from "../types/index.js";

export function parseMessagePage(html: string): MessagePageParse {
  const $ = cheerio.load(html);
  const folders = new Map<string, string>();
  $("a[href^='/message/']").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const match = href.match(/^\/message\/(inbox|saved|sent|trash)(?:\?|$)/);
    if (match?.[1]) folders.set(match[1], href);
  });

  const messageLinks: MessagePageParse["messageLinks"] = [];
  $("a[href*='/message/show/']").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const label = cleanText($(element).text());
    messageLinks.push({
      messageId: href.match(/\/message\/show\/(\d+)/)?.[1] ?? null,
      href,
      labelLength: label.length,
      hasVisibleLabel: label.length > 0,
    });
  });

  const forms: MessagePageParse["forms"] = [];
  $("form").each((_, element) => {
    const form = $(element);
    const action = form.attr("action") ?? "";
    if (!action.includes("/message/")) return;
    const inputNames = new Set<string>();
    form.find("input[name], select[name], textarea[name]").each((__, field) => {
      const name = $(field).attr("name");
      if (name) inputNames.add(name);
    });
    forms.push({
      method: (form.attr("method") ?? "get").toLowerCase(),
      action,
      inputNames: [...inputNames].sort(),
    });
  });

  return {
    kind: "message_page",
    title: cleanText($("title").first().text()) || null,
    folders: [...folders.entries()].map(([slug, href]) => ({ slug, href })),
    messageLinks,
    forms,
  };
}
