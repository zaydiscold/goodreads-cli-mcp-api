import { Command } from "commander";
import { commentCreate, commentsList } from "../engine.js";
import { printJson } from "../lib.js";

export function commentsCommand(): Command {
  const command = new Command("comments").description(
    "Inspect Goodreads comments/recent-post metadata without raw comment text.",
  );

  command
    .command("list")
    .description("Read a live authenticated user comments/recent-post page or parse a fixture.")
    .option("--user-slug <slug>", "Goodreads user slug. Required for live reads.")
    .option("--fixture <path>", "Comments HTML fixture to parse.")
    .option("--json", "Emit JSON.", true)
    .action(async (options: { userSlug?: string; fixture?: string }) => {
      printJson(await commentsList({ userSlug: options.userSlug, fixture: options.fixture }));
    });

  command
    .command("create")
    .description("Create a comment on an exact review, with a preview by default.")
    .requiredOption("--review-id <id>")
    .requiredOption("--text <text>")
    .option("--approved-review-id <id>")
    .option("--approved-text-sha256 <sha>")
    .option("--execute", "Send the approved comment", false)
    .action(async (options) => printJson(await commentCreate(options)));
  return command;
}
