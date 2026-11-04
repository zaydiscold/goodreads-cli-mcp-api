import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  freshWidgetId,
  parseShelfWidget,
  shelfWidgetPath,
  widgetUserId,
} from "../src/parsers/widget.js";

// Captured from a live custom_widget response (2026-11-04), account id and
// name replaced with 42 / example-reader.
const live = readFileSync(
  new URL("./samples/widget-currently-reading.js", import.meta.url),
  "utf8",
);

function widget(options: { user?: string; shelf?: string; items?: string } = {}): string {
  const user = options.user ?? "42-example-reader";
  const shelf = options.shelf ?? "currently-reading";
  const html =
    `  <div class="gr_custom_container_7">\n    <h2 class="gr_custom_header_7">\n` +
    `    <a href="https://www.goodreads.com/review/list/${user}?shelf=${shelf}&amp;utm_medium=api">R</a>\n    </h2>\n` +
    (options.items ?? "") +
    `  </div>\n`;
  const escaped = html.replace(/"/g, '\\"').replace(/\//g, "\\/").replace(/\n/g, "\\n");
  return `  var widget_code = '${escaped}'\n  var widget_div = document.getElementById('gr_custom_widget_7')\n`;
}

describe("public shelf widget", () => {
  it("parses a real widget response in shelf order with ids and ratings", () => {
    const parsed = parseShelfWidget(live, { user: "42", shelf: "currently-reading" });
    expect(parsed.itemCount).toBe(9);
    expect(parsed.signals.widgetMayCapAt100).toBe(false);
    expect(parsed.items[0]).toMatchObject({
      title: "Make Something Wonderful",
      authorName: "Steve Jobs",
      bookId: "128533513",
      reviewId: "9011718061",
      reviewUrl: "https://www.goodreads.com/review/show/9011718061",
      userRating: 0,
    });
    expect(parsed.items[1]?.title).toBe("Dominion of Blades (Dominion of Blades, #1)");
    expect(parsed.items.every((item) => item.title && item.authorName && item.bookId)).toBe(true);
  });

  it("accepts an empty shelf but refuses other users, other shelves and non-widgets", () => {
    expect(parseShelfWidget(widget(), { user: "42", shelf: "currently-reading" }).items).toEqual(
      [],
    );
    expect(() =>
      parseShelfWidget(widget({ shelf: "read" }), { user: "42", shelf: "currently-reading" }),
    ).toThrow("not currently-reading");
    expect(() =>
      parseShelfWidget(widget({ user: "421-someone" }), { user: "42", shelf: "currently-reading" }),
    ).toThrow("not user 42");
    expect(() =>
      parseShelfWidget("<html>Page not found</html>", { user: "42", shelf: "read" }),
    ).toThrow("did not return a shelf widget");
  });

  it("asks with the numeric id and a fresh widget_id every time", () => {
    expect(widgetUserId("42-example-reader")).toBe("42");
    expect(() => widgetUserId("example-reader")).toThrow("numeric Goodreads user id");
    const a = new URL(shelfWidgetPath("42-example-reader", "read"), "https://www.goodreads.com");
    const b = new URL(shelfWidgetPath("42", "read"), "https://www.goodreads.com");
    expect(a.pathname).toBe("/review/custom_widget/42.shelf");
    expect(a.searchParams.get("shelf")).toBe("read");
    expect(a.searchParams.get("widget_id")).not.toBe(b.searchParams.get("widget_id"));
    expect(new Set(Array.from({ length: 50 }, freshWidgetId)).size).toBe(50);
  });
});
