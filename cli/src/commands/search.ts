import { Command } from "commander";
import { searchBooks } from "../engine.js";
import { printJson } from "../lib.js";

export function searchCommand(): Command {
  const command = new Command("search").description(
    "Resolve title/author queries into Goodreads book candidates.",
  );
  command
    .command("books")
    .description("Search Goodreads book candidates by title or author.")
    .requiredOption("--query <query>", "Title, author, or both.")
    .option("--limit <n>", "Maximum candidates to return.", "20")
    .option("--base-url <url>", "Goodreads base URL.", "https://www.goodreads.com")
    .option("--json", "Emit JSON.", true)
    .action(async (options: { query: string; limit: string; baseUrl?: string }) => {
      printJson(
        await searchBooks({
          query: options.query,
          limit: Number(options.limit),
          baseUrl: options.baseUrl,
        }),
      );
    });
  return command;
}
