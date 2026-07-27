import { Command } from "commander";
import { shelfAdd, shelfRemove, shelvesDiscover } from "../engine.js";
import { printJson } from "../lib.js";

interface ShelvesOptions {
  fixture?: string;
  user?: string;
  baseUrl?: string;
  json?: boolean;
}

interface ShelfAddOptions {
  bookId: string;
  name: string;
  execute?: boolean;
}

interface ShelfRemoveOptions {
  bookId: string;
  name: string;
  execute?: boolean;
}

export function shelvesCommand(): Command {
  const command = new Command("shelves").description(
    "Discover account-specific Goodreads shelf inventory.",
  );

  command
    .command("discover")
    .description("Discover shelf slugs and counts from a Goodreads shelf page.")
    .option("--fixture <path>", "Parse a local shelf HTML fixture instead of fetching.")
    .option("--user <user>", "Goodreads numeric id or slug. Required unless --fixture is supplied.")
    .option("--base-url <url>", "Goodreads base URL.", "https://www.goodreads.com")
    .option("--json", "Emit JSON.", true)
    .action(async (options: ShelvesOptions) => {
      printJson(
        await shelvesDiscover({
          fixture: options.fixture,
          user: options.user,
          baseUrl: options.baseUrl,
        }),
      );
    });

  command
    .command("add")
    .description("Add a book to a shelf via POST /shelf/add_to_shelf. Dry-run unless --execute.")
    .requiredOption("--book-id <id>", "Goodreads numeric book id.")
    .requiredOption("--name <shelf>", "Target shelf slug (e.g. to-read, read, currently-reading).")
    .option("--execute", "Send the live write to Goodreads.", false)
    .option("--json", "Emit JSON.", true)
    .action(async (options: ShelfAddOptions) => {
      printJson(
        await shelfAdd({
          bookId: options.bookId,
          shelf: options.name,
          execute: options.execute,
        }),
      );
    });

  command
    .command("remove")
    .description(
      "Remove a book from a shelf via POST /shelf/add_to_shelf?a=remove. Dry-run unless --execute.",
    )
    .requiredOption("--book-id <id>", "Goodreads numeric book id.")
    .requiredOption("--name <shelf>", "Target shelf slug.")
    .option("--execute", "Send the live write to Goodreads.", false)
    .option("--json", "Emit JSON.", true)
    .action(async (options: ShelfRemoveOptions) => {
      printJson(
        await shelfRemove({
          bookId: options.bookId,
          shelf: options.name,
          execute: options.execute,
        }),
      );
    });

  return command;
}
