import { Command } from "commander";
import { notesHide, notesInspect, notesPublicize, notesPublicizePlan } from "../engine.js";
import { printJson } from "../lib.js";

export function notesCommand(): Command {
  const command = new Command("notes").description(
    "Read Kindle notes/highlights metadata without raw highlight text.",
  );

  command
    .command("inspect")
    .description("Parse notes index or book-detail HTML into redacted metadata.")
    .requiredOption("--fixture <path>", "Local notes HTML fixture.")
    .option("--json", "Emit JSON.", true)
    .action(async (options: { fixture: string }) => {
      printJson(await notesInspect({ fixture: options.fixture }));
    });

  command
    .command("publicize-plan")
    .description(
      "Build the verified workflow plan for publicizing one book's notes/highlights. This does not submit anything.",
    )
    .requiredOption("--book-id <id>", "Goodreads book id.")
    .option(
      "--book-slug <slug>",
      "Goodreads notes detail book slug, for example 218134959-mr-whisper.",
    )
    .option("--user-slug <slug>", "Goodreads user slug for reload verification.")
    .option(
      "--detail-fixture <path>",
      "Optional notes detail HTML fixture for count/visibility preflight.",
    )
    .option(
      "--approved-book-id <id>",
      "Book id approved for publicizing.",
      (value, previous: string[] = []) => [...previous, value],
      [],
    )
    .option("--json", "Emit JSON.", true)
    .action(
      async (options: {
        bookId: string;
        bookSlug?: string;
        userSlug?: string;
        detailFixture?: string;
        approvedBookId: string[];
      }) => {
        printJson(
          await notesPublicizePlan({
            bookId: options.bookId,
            bookSlug: options.bookSlug,
            userSlug: options.userSlug,
            detailFixture: options.detailFixture,
            approvedBookIds: options.approvedBookId ?? [],
          }),
        );
      },
    );

  command
    .command("publicize")
    .description(
      "Execute the approved notes-publicize workflow. Requires --execute, exact approved book id, and GOODREADS_ALLOW_NOTES_PUBLICIZE=1.",
    )
    .requiredOption("--book-id <id>", "Goodreads book id.")
    .option(
      "--approved-book-id <id>",
      "Book id approved for publicizing.",
      (value, previous: string[] = []) => [...previous, value],
      [],
    )
    .option("--execute", "Actually send PUT /notes/{book_id}/share.", false)
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
          await notesPublicize({
            bookId: options.bookId,
            approvedBookIds: options.approvedBookId ?? [],
            execute: options.execute,
            dryRun: options.dryRun,
          }),
        );
      },
    );

  command
    .command("hide")
    .description(
      "Execute the approved notes-hide workflow. Requires --execute, exact approved book id, and GOODREADS_ALLOW_NOTES_PUBLICIZE=1.",
    )
    .requiredOption("--book-id <id>", "Goodreads book id.")
    .option(
      "--approved-book-id <id>",
      "Book id approved for hiding.",
      (value, previous: string[] = []) => [...previous, value],
      [],
    )
    .option("--execute", "Actually send PUT /notes/{book_id}/share with visible=false.", false)
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
          await notesHide({
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
