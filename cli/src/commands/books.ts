import { Command } from "commander";
import { booksExport, booksList } from "../engine.js";
import { printJson } from "../lib.js";

interface BooksListOptions {
  shelf?: string;
  user?: string;
  baseUrl?: string;
  fixtureDir?: string;
  source?: "html" | "rss";
  json?: boolean;
}

interface BooksExportOptions extends BooksListOptions {
  shelves?: string;
}

export function booksCommand(): Command {
  const command = new Command("books").description("List and export Goodreads shelf books.");

  command
    .command("list")
    .description("List one shelf from authenticated HTML fixtures or public RSS.")
    .requiredOption("--shelf <slug>", "Shelf slug, discovered with shelves discover.")
    .option("--fixture-dir <dir>", "Directory containing shelf HTML fixtures.")
    .option("--source <source>", "html or rss.", "html")
    .option("--user <user>", "Goodreads numeric id or slug. Required for RSS/live fetches.")
    .option("--base-url <url>", "Goodreads base URL.", "https://www.goodreads.com")
    .option("--json", "Emit JSON.", true)
    .action(async (options: BooksListOptions) => {
      printJson(
        await booksList({
          shelf: options.shelf ?? "",
          fixtureDir: options.fixtureDir,
          source: options.source,
          user: options.user,
          baseUrl: options.baseUrl,
        }),
      );
    });

  command
    .command("export")
    .description("Export one or more shelves from fixture-backed authenticated HTML.")
    .requiredOption("--fixture-dir <dir>", "Directory containing shelf HTML fixtures.")
    .option(
      "--shelves <csv>",
      "Comma-separated shelf slugs. Defaults to discovered shelf fixture files.",
    )
    .option("--json", "Emit JSON.", true)
    .action(async (options: BooksExportOptions) => {
      if (!options.fixtureDir) throw new Error("--fixture-dir is required for books export");
      printJson(await booksExport({ fixtureDir: options.fixtureDir, shelves: options.shelves }));
    });

  return command;
}
