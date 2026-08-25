import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildNotesPublicizeWorkflowPlan,
  buildRecentReadingList,
  buildRecentReadingNotes,
} from "../src/workflows/recentReading.js";

function shelfHtml(bookId = "123", title = "Example Book"): string {
  return `
    <html><head><title>Reader's 'read' books on Goodreads (1 book)</title></head>
    <body>
      <a href="/review/list/reader?shelf=read">read (1)</a>
      <table id="booksBody">
        <tr id="review_111">
          <td><a href="/book/show/${bookId}-example">${title}</a></td>
        </tr>
      </table>
    </body></html>
  `;
}

async function fixtureDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "goodreads-recent-reading-"));
  await writeFile(join(directory, "shelf-read.html"), shelfHtml());
  return directory;
}

describe("recent-reading workflow identity", () => {
  it("validates limits in the shared workflow, not only adapters", async () => {
    const fixtureDir = await fixtureDirectory();
    for (const limit of [0, -1, 1.5, 201]) {
      await expect(
        buildRecentReadingList({ fixtureDir, shelves: ["read"], limit }),
      ).rejects.toThrow("limit must be an integer from 1 to 200");
    }
  });

  it("reports an explicitly requested missing notes index distinctly", async () => {
    const fixtureDir = await fixtureDirectory();
    await expect(
      buildRecentReadingNotes({
        fixtureDir,
        shelves: ["read"],
        limit: 25,
        notesIndexFixture: join(fixtureDir, "missing-notes.html"),
      }),
    ).rejects.toThrow("Explicit notes index fixture was not found");
  });

  it("does not derive a verification slug from another book", async () => {
    const fixtureDir = await fixtureDirectory();
    const detailFixture = join(fixtureDir, "wrong-detail.html");
    await writeFile(
      detailFixture,
      '<html><body><a href="/notes/999-other-book/reader">Other Book</a><div class="js-readingNote" data-visible="true"></div></body></html>',
    );

    const plan = await buildNotesPublicizeWorkflowPlan({
      bookId: "123",
      detailFixture,
      approvedBookIds: ["123"],
    });

    expect(plan).toMatchObject({
      bookSlug: null,
      userSlug: null,
      verifyRoute: null,
      routeResolvable: false,
      confidence: "low",
      action: "blocked-identity-mismatch",
      evidence: {
        requestedBookIdentityMatched: false,
        conflictingBookIdentityObserved: true,
      },
    });
    expect(plan.blockers).toEqual(
      expect.arrayContaining([
        "notes detail fixture does not match the requested book id",
        "verification route is not resolvable for the requested book and user",
      ]),
    );
  });

  it("derives verification metadata only from an exact book match", async () => {
    const fixtureDir = await fixtureDirectory();
    const detailFixture = join(fixtureDir, "matching-detail.html");
    await writeFile(
      detailFixture,
      '<html><body><a href="/notes/123-example-book/reader">Example Book</a><div class="js-readingNote" data-visible="true"></div></body></html>',
    );

    const plan = await buildNotesPublicizeWorkflowPlan({
      bookId: "123",
      detailFixture,
      approvedBookIds: ["123"],
    });

    expect(plan).toMatchObject({
      bookSlug: "123-example-book",
      userSlug: "reader",
      verifyRoute: "/notes/123-example-book/reader",
      routeResolvable: true,
      confidence: "high",
      action: "noop-already-public",
      evidence: {
        requestedBookIdentityMatched: true,
        conflictingBookIdentityObserved: false,
      },
      blockers: [],
    });
  });

  it("marks comment routing resolvable only when the account user slug is known", async () => {
    const fixtureDir = await fixtureDirectory();
    const notesIndexFixture = join(fixtureDir, "notes-index.html");
    await writeFile(
      notesIndexFixture,
      '<html><body><a href="/notes/123-example-book/reader">Example Book</a></body></html>',
    );

    const joined = await buildRecentReadingNotes({
      fixtureDir,
      notesIndexFixture,
      shelves: ["read"],
      limit: 25,
    });

    expect(joined.books[0]?.comments).toEqual({
      routeAvailable: true,
      userSlugKnown: true,
      routeResolvable: true,
      defaultRouteTemplate: "/comment/list/{user_slug}",
      route: "/comment/list/reader",
    });
  });
});
