import { Command } from "commander";
import { yearInBooks } from "../engine.js";
import { printJson } from "../lib.js";

interface YearInBooksOptions {
  userId: string;
  year: string;
  fixture?: string;
  baseUrl?: string;
  json?: boolean;
}

export function statsCommand(): Command {
  const command = new Command("stats").description("Read public Goodreads reading statistics.");

  command
    .command("year-in-books")
    .description("Show a user's Year in Books totals and book extrema without review text.")
    .requiredOption("--user-id <id>", "Goodreads numeric user id.")
    .requiredOption("--year <year>", "Four-digit reading year.")
    .option("--fixture <path>", "Parse a local synthetic/private HTML fixture instead of fetching.")
    .option("--base-url <url>", "Goodreads base URL.", "https://www.goodreads.com")
    .option("--json", "Emit JSON.", true)
    .action(async (options: YearInBooksOptions) => {
      printJson(
        await yearInBooks({
          userId: options.userId,
          year: Number(options.year),
          fixture: options.fixture,
          baseUrl: options.baseUrl,
        }),
      );
    });

  return command;
}
