import { describe, expect, it } from "vitest";
import { parseLibraryEditState } from "../src/workflows/libraryWrites.js";

describe("authenticated library edit state", () => {
  it("parses the chosen exclusive shelf, rating, and review text", () => {
    const html = `
      <script>
        new ShelfChooser("shelfChooser_review_1", 58169,
          ["to-read", "currently-reading", "read", "custom"],
          { chosen: ["currently-reading", "custom"], exclusive: ["to-read", "currently-reading", "read"] });
      </script>
      <div data-rating="4.0"></div>
      <textarea name="review[review]">A &amp; B</textarea>
    `;
    expect(parseLibraryEditState(html)).toEqual({
      status: "currently-reading",
      rating: 4,
      reviewText: "A & B",
    });
  });

  it("falls back to the rendered shelf link and preserves empty review state", () => {
    const html = `
      <a class="shelfLink" href="/review/list/1?shelf=to-read">to-read</a>
      <div data-rating="0.0"></div>
      <textarea id="review_review_usertext"></textarea>
    `;
    expect(parseLibraryEditState(html)).toEqual({ status: "to-read", rating: 0, reviewText: "" });
  });
});
