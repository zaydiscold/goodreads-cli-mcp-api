import { Command } from "commander";
import { shelvesDiscover } from "../engine.js";
import { printJson } from "../lib.js";

interface ShelvesOptions {
  fixture?: string;
  user?: string;
  baseUrl?: string;
  json?: boolean;
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

  return command;
}
