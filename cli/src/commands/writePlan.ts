import { Command } from "commander";
import { bookshelfMovePlan, writePlanNotesPublicize } from "../engine.js";
import { printJson } from "../lib.js";

export function writePlanCommand(): Command {
  const command = new Command("write-plan").description(
    "Print dry-run plans for account mutations.",
  );

  const books = new Command("books").description("Book/shelf mutation plans.");
  books
    .command("move")
    .description("Plan a book/review shelf move without submitting it.")
    .requiredOption("--review-id <id>", "Goodreads review id from a shelf row.")
    .requiredOption("--to-shelf <slug>", "Discovered target shelf slug.")
    .requiredOption("--user <id>", "Goodreads numeric user id from the current account/page.")
    .action((options: { reviewId: string; toShelf: string; user: string }) => {
      printJson(bookshelfMovePlan(options));
    });

  const notes = new Command("notes").description("Notes/highlights mutation plans.");
  notes
    .command("publicize")
    .description("Plan publicizing all notes for a book.")
    .requiredOption("--book-id <id>", "Goodreads book id.")
    .option("--book-slug <slug>", "Goodreads notes detail book slug for reload verification.")
    .option("--user-slug <slug>", "Goodreads user slug for reload verification.")
    .action((options: { bookId: string; bookSlug?: string; userSlug?: string }) => {
      printJson(writePlanNotesPublicize(options));
    });

  command.addCommand(books);
  command.addCommand(notes);
  return command;
}
