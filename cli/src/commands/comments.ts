import { Command } from "commander";
import { commentsList } from "../engine.js";
import { printJson } from "../lib.js";

export function commentsCommand(): Command {
  const command = new Command("comments").description(
    "Inspect Goodreads comments/recent-post metadata without raw comment text.",
  );

  command
    .command("list")
    .description("Plan or parse a user comments/recent-post page.")
    .option("--user-slug <slug>", "Goodreads user slug. Required for live URL planning.")
    .option("--fixture <path>", "Comments HTML fixture to parse.")
    .option("--json", "Emit JSON.", true)
    .action(async (options: { userSlug?: string; fixture?: string }) => {
      printJson(await commentsList({ userSlug: options.userSlug, fixture: options.fixture }));
    });

  return command;
}
