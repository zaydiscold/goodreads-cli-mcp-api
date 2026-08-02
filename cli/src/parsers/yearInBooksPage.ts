import * as cheerio from "cheerio";

export interface YearInBooksBook {
  bookId: string | null;
  slug: string | null;
  title: string | null;
  author: string | null;
  pages?: number | null;
  shelvedCount?: number | null;
  rating?: number | null;
}

export interface YearInBooksParse {
  kind: "year_in_books";
  year: number;
  userId: string;
  title: string | null;
  booksRead: number | null;
  pagesRead: number | null;
  averageBookLengthPages: number | null;
  averageUserRating: number | null;
  shortestBook: YearInBooksBook | null;
  longestBook: YearInBooksBook | null;
  mostShelvedBook: YearInBooksBook | null;
  leastShelvedBook: YearInBooksBook | null;
  highestRatedBook: YearInBooksBook | null;
}

function numberFrom(value: string): number | null {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function bookIdentity(
  $: cheerio.CheerioAPI,
  container: ReturnType<cheerio.CheerioAPI>,
): YearInBooksBook {
  const anchor = container.find('a[href*="/book/show/"]').first();
  const href = anchor.attr("href") ?? "";
  const match = href.match(/\/book\/show\/(\d+)(?:-([^/?#]+))?/);
  const alt = container.find("img[alt]").first().attr("alt")?.trim() ?? "";
  const by = alt.lastIndexOf(" by ");
  return {
    bookId: match?.[1] ?? null,
    slug: match?.[2] ?? null,
    title: alt ? (by > 0 ? alt.slice(0, by) : alt) : null,
    author: by > 0 ? alt.slice(by + 4) : null,
  };
}

function lockup(
  $: cheerio.CheerioAPI,
  headingId: string,
  labelId: string,
  metric: "pages" | "shelvedCount",
): YearInBooksBook | null {
  const heading = $(`#${headingId}`).first();
  if (!heading.length) return null;
  const container = heading.closest(".yyibBooksLockup__bookContainer");
  const book = bookIdentity($, container);
  const value = numberFrom($(`#${labelId}`).first().text());
  return { ...book, [metric]: value };
}

function heroCount($: cheerio.CheerioAPI, label: string): number | null {
  let result: number | null = null;
  $(".heroImageContainer__avatarOrCount").each((_, element) => {
    if (result !== null) return;
    const node = $(element);
    if (node.find(".heroImageContainer__countLabel").text().trim().toLowerCase() !== label) return;
    result = numberFrom(node.find(".heroImageContainer__count").text() || node.text());
  });
  return result;
}

export function parseYearInBooksPage(
  html: string,
  options: { userId: string; year: number },
): YearInBooksParse {
  const $ = cheerio.load(html);
  const highestContainer = $(".crowdFavoriteWidget").first();
  const highestRatedBook = highestContainer.length
    ? {
        ...bookIdentity($, highestContainer),
        rating: numberFrom(highestContainer.find(".yyibCrowdFavoriteRatingLabel").text()),
      }
    : null;

  return {
    kind: "year_in_books",
    year: options.year,
    userId: options.userId,
    title: $("title").first().text().trim() || null,
    booksRead: heroCount($, "books read"),
    pagesRead: heroCount($, "pages read"),
    averageBookLengthPages: numberFrom($(".yyibAverageBookLengthData").first().text()),
    averageUserRating: numberFrom(
      $(".yyibAverageRatingData .yyibAverageRatingData__pageCount").first().text() ||
        $(".yyibAverageRatingData").first().text(),
    ),
    shortestBook: lockup($, "yyibShortestBookHeading", "yyibShortestBookLabel", "pages"),
    longestBook: lockup($, "yyibLongestBookHeading", "yyibLongestBookLabel", "pages"),
    mostShelvedBook: lockup($, "yyibMostPopularHeading", "yyibMostPopularLabel", "shelvedCount"),
    leastShelvedBook: lockup($, "yyibLeastPopularHeading", "yyibLeastPopularLabel", "shelvedCount"),
    highestRatedBook,
  };
}
