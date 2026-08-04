import { Command } from "commander";
import { authorShow, recommendationsList } from "../engine.js";
import { printJson } from "../lib.js";

export function recommendationsCommand(): Command {
  const command = new Command("recommendations").description(
    "Read personalized Goodreads recommendations as book metadata.",
  );
  command
    .command("list")
    .description("List personalized recommendation cards from the authenticated Goodreads session.")
    .option("--limit <n>", "Maximum books to return.", "20")
    .option("--base-url <url>", "Goodreads base URL.", "https://www.goodreads.com")
    .option("--json", "Emit JSON.", true)
    .action(async (options: { limit: string; baseUrl?: string }) => {
      printJson(
        await recommendationsList({ limit: Number(options.limit), baseUrl: options.baseUrl }),
      );
    });
  return command;
}

export function authorCommand(): Command {
  const command = new Command("author").description(
    "Read public Goodreads author identity and bibliography metadata.",
  );
  command
    .command("show")
    .description("Show an author's public identity, bio length, and book metadata without prose.")
    .requiredOption("--author-slug <slug>", "Goodreads author slug, e.g. 4273.Roald_Dahl.")
    .option("--limit <n>", "Maximum books to return.", "20")
    .option("--base-url <url>", "Goodreads base URL.", "https://www.goodreads.com")
    .option("--json", "Emit JSON.", true)
    .action(async (options: { authorSlug: string; limit: string; baseUrl?: string }) => {
      printJson(
        await authorShow({
          authorSlug: options.authorSlug,
          limit: Number(options.limit),
          baseUrl: options.baseUrl,
        }),
      );
    });
  return command;
}
