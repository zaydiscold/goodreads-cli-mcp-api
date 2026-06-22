import { Command } from "commander";
import { quotesAdd, quotesRemove, quotesReorder } from "../engine.js";
import { printJson } from "../lib.js";

export function quotesCommand(): Command {
  const command = new Command("quotes").description(
    "Add, remove, and reorder your Goodreads quotes (writes default to dry-run).",
  );

  command
    .command("add")
    .description("Add (create) a quote. Dry-run unless --execute. POST /quotes.")
    .requiredOption("--body <text>", "The quote text.")
    .requiredOption("--author <name>", "The quote's author name.")
    .option("--title <title>", "Optional source/book title.")
    .option("--tags <tags>", "Optional comma-separated tags.")
    .option("--execute", "Actually send the live write.", false)
    .option("--json", "Emit JSON.", true)
    .action(
      async (options: {
        body: string;
        author: string;
        title?: string;
        tags?: string;
        execute?: boolean;
      }) => {
        printJson(
          await quotesAdd({
            body: options.body,
            author: options.author,
            title: options.title,
            tags: options.tags,
            execute: options.execute,
          }),
        );
      },
    );

  command
    .command("remove")
    .description(
      "Remove one quote from your collection by slug. Dry-run unless --execute. POST /quotes/{quote_slug}/remove.",
    )
    .requiredOption(
      "--quote-slug <slug>",
      "Quote slug, for example 22890102-dreams-come-true-when-you-don-t-sleep.",
    )
    .option("--execute", "Actually send the live write.", false)
    .option("--json", "Emit JSON.", true)
    .action(async (options: { quoteSlug: string; execute?: boolean }) => {
      printJson(await quotesRemove({ quoteSlug: options.quoteSlug, execute: options.execute }));
    });

  command
    .command("reorder")
    .description(
      "Reorder one quote (up|down|top|bottom). Dry-run unless --execute. POST /quotes/move_*/{quote_id}.",
    )
    .requiredOption(
      "--quote-id <id>",
      "Numeric quote id (from the reorder controls on /quotes/list).",
    )
    .requiredOption("--direction <dir>", "One of: up, down, top, bottom.")
    .option("--execute", "Actually send the live write.", false)
    .option("--json", "Emit JSON.", true)
    .action(async (options: { quoteId: string; direction: string; execute?: boolean }) => {
      printJson(
        await quotesReorder({
          quoteId: options.quoteId,
          direction: options.direction,
          execute: options.execute,
        }),
      );
    });

  return command;
}
