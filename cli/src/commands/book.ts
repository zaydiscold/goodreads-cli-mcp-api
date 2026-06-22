import { Command } from "commander";
import { bookShow } from "../engine.js";
import { printJson } from "../lib.js";

interface BookOptions {
  fixture?: string;
  baseUrl?: string;
  json?: boolean;
}

export function bookCommand(): Command {
  const command = new Command("book").description("Parse public Goodreads book pages.");

  command
    .command("show")
    .description("Show normalized JSON-LD and Next.js metadata for a book page.")
    .argument("[slug-or-id]", "Goodreads book slug or id.")
    .option("--fixture <path>", "Parse a local book HTML fixture instead of fetching.")
    .option("--base-url <url>", "Goodreads base URL.", "https://www.goodreads.com")
    .option("--json", "Emit JSON.", true)
    .action(async (slugOrId: string | undefined, options: BookOptions) => {
      printJson(await bookShow({ slugOrId, fixture: options.fixture, baseUrl: options.baseUrl }));
    });

  return command;
}
