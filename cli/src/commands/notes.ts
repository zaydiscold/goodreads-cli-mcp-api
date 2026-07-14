import { Command } from "commander";
import { notesHide, notesInspect, notesPublicize, notesPublicizePlan } from "../engine.js";
import { printJson } from "../lib.js";

interface PublicizePlanOptions {
  bookId: string;
  bookSlug?: string;
  userSlug?: string;
  detailFixture?: string;
  approvedBookId: string[];
}

interface VisibilityOptions {
  bookId: string;
  approvedBookId: string[];
  execute?: boolean;
  dryRun?: boolean;
}

function appendValue(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function inspectCommand(): Command {
  return new Command("inspect")
    .description("Parse notes index or book-detail HTML into redacted metadata.")
    .requiredOption("--fixture <path>", "Local notes HTML fixture.")
    .option("--json", "Emit JSON.", true)
    .action(async (options: { fixture: string }) => {
      printJson(await notesInspect({ fixture: options.fixture }));
    });
}

function publicizePlanCommand(): Command {
  return new Command("publicize-plan")
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
    .option("--approved-book-id <id>", "Book id approved for publicizing.", appendValue, [])
    .option("--json", "Emit JSON.", true)
    .action(async (options: PublicizePlanOptions) => {
      printJson(
        await notesPublicizePlan({
          bookId: options.bookId,
          bookSlug: options.bookSlug,
          userSlug: options.userSlug,
          detailFixture: options.detailFixture,
          approvedBookIds: options.approvedBookId ?? [],
        }),
      );
    });
}

function visibilityCommand(action: "publicize" | "hide"): Command {
  const publicize = action === "publicize";
  const verb = publicize ? "publicizing" : "hiding";
  const submitDescription = publicize
    ? "Actually send PUT /notes/{book_id}/share."
    : "Actually send PUT /notes/{book_id}/share with visible=false.";
  return new Command(action)
    .description(
      `Execute the approved notes-${action} workflow. Requires --execute, exact approved book id, and GOODREADS_ALLOW_NOTES_PUBLICIZE=1.`,
    )
    .requiredOption("--book-id <id>", "Goodreads book id.")
    .option("--approved-book-id <id>", `Book id approved for ${verb}.`, appendValue, [])
    .option("--execute", submitDescription, false)
    .option("--dry-run", "Preview the request even if execute gates are present.", false)
    .option("--json", "Emit JSON.", true)
    .action(async (options: VisibilityOptions) => {
      const operation = publicize ? notesPublicize : notesHide;
      printJson(
        await operation({
          bookId: options.bookId,
          approvedBookIds: options.approvedBookId ?? [],
          execute: options.execute,
          dryRun: options.dryRun,
        }),
      );
    });
}

export function notesCommand(): Command {
  return new Command("notes")
    .description("Read Kindle notes/highlights metadata without raw highlight text.")
    .addCommand(inspectCommand())
    .addCommand(publicizePlanCommand())
    .addCommand(visibilityCommand("publicize"))
    .addCommand(visibilityCommand("hide"));
}
