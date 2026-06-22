import { Command } from "commander";
import {
  recentReadingList,
  recentReadingNotes,
  recentReadingPublicize,
  recentReadingPublicizePlan,
} from "../engine.js";
import { parseCsv, printJson } from "../lib.js";

interface BaseOptions {
  fixtureDir?: string;
  shelves?: string;
  limit?: string;
  json?: boolean;
}

interface NotesOptions extends BaseOptions {
  notesIndexFixture?: string;
}

interface PublicizeOptions extends NotesOptions {
  approvedBookId: string[];
  execute?: boolean;
}

function limitValue(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "25", 10);
  if (!Number.isFinite(parsed) || parsed < 1) throw new Error("--limit must be a positive integer");
  return Math.min(parsed, 200);
}

function shelvesValue(value: string | undefined): string[] {
  const shelves = parseCsv(value ?? "currently-reading,read");
  if (shelves.length === 0) throw new Error("--shelves must contain at least one shelf slug");
  return shelves;
}

function fixtureDirValue(value: string | undefined): string {
  if (!value) throw new Error("--fixture-dir is required");
  return value;
}

export function recentReadingCommand(): Command {
  const command = new Command("recent-reading").description(
    "Join current/recent shelf books to notes/highlights metadata.",
  );

  command
    .command("list")
    .description(
      "List current/recent shelf books from authenticated HTML fixtures without hardcoded account defaults.",
    )
    .requiredOption("--fixture-dir <dir>", "Directory containing shelf HTML fixtures.")
    .option("--shelves <csv>", "Shelf slugs to join after discovery.", "currently-reading,read")
    .option("--limit <n>", "Maximum books to emit.", "25")
    .option("--json", "Emit JSON.", true)
    .action(async (options: BaseOptions) => {
      printJson(
        await recentReadingList({
          fixtureDir: fixtureDirValue(options.fixtureDir),
          shelves: shelvesValue(options.shelves),
          limit: limitValue(options.limit),
        }),
      );
    });

  command
    .command("notes")
    .description(
      "Join current/recent books to notes/highlights links and visibility metadata without raw highlight text.",
    )
    .requiredOption("--fixture-dir <dir>", "Directory containing shelf and notes HTML fixtures.")
    .option(
      "--notes-index-fixture <path>",
      "Explicit notes index fixture. Defaults to notes-index.html or notes.html in fixture dir.",
    )
    .option("--shelves <csv>", "Shelf slugs to join after discovery.", "currently-reading,read")
    .option("--limit <n>", "Maximum books to emit.", "25")
    .option("--json", "Emit JSON.", true)
    .action(async (options: NotesOptions) => {
      printJson(
        await recentReadingNotes({
          fixtureDir: fixtureDirValue(options.fixtureDir),
          notesIndexFixture: options.notesIndexFixture,
          shelves: shelvesValue(options.shelves),
          limit: limitValue(options.limit),
        }),
      );
    });

  command
    .command("publicize-plan")
    .description(
      "Plan notes/highlights publicization for recent/current books. This never submits Goodreads writes.",
    )
    .requiredOption("--fixture-dir <dir>", "Directory containing shelf and notes HTML fixtures.")
    .option(
      "--notes-index-fixture <path>",
      "Explicit notes index fixture. Defaults to notes-index.html or notes.html in fixture dir.",
    )
    .option("--shelves <csv>", "Shelf slugs to join after discovery.", "currently-reading,read")
    .option("--limit <n>", "Maximum books to consider.", "25")
    .option(
      "--approved-book-id <id>",
      "Book id approved for publicizing.",
      (value, previous: string[] = []) => [...previous, value],
      [],
    )
    .option("--json", "Emit JSON.", true)
    .action(async (options: PublicizeOptions) => {
      printJson(
        await recentReadingPublicizePlan({
          fixtureDir: fixtureDirValue(options.fixtureDir),
          notesIndexFixture: options.notesIndexFixture,
          shelves: shelvesValue(options.shelves),
          limit: limitValue(options.limit),
          approvedBookIds: options.approvedBookId ?? [],
        }),
      );
    });

  command
    .command("publicize")
    .description(
      "Execute approved notes/highlights publicization for recent/current books. Requires exact approval gates.",
    )
    .requiredOption("--book-id <id>", "Exact Goodreads book id to publicize.")
    .option(
      "--approved-book-id <id>",
      "Book id approved for publicizing.",
      (value, previous: string[] = []) => [...previous, value],
      [],
    )
    .option("--execute", "Actually send the Goodreads notes-publicize request.", false)
    .option("--dry-run", "Preview the request even if execute gates are present.", false)
    .option("--json", "Emit JSON.", true)
    .action(
      async (options: {
        bookId: string;
        approvedBookId: string[];
        execute?: boolean;
        dryRun?: boolean;
      }) => {
        printJson(
          await recentReadingPublicize({
            bookId: options.bookId,
            approvedBookIds: options.approvedBookId ?? [],
            execute: options.execute,
            dryRun: options.dryRun,
          }),
        );
      },
    );

  return command;
}
