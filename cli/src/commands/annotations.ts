import { Command } from "commander";
import { annotationsList, annotationsThoughtsPlan } from "../engine.js";
import { printJson } from "../lib.js";

export function annotationsCommand(): Command {
  const command = new Command("annotations").description(
    "Inspect Kindle note/highlight annotation metadata without raw text.",
  );

  command
    .command("list")
    .description("Parse annotation metadata from a notes detail fixture.")
    .requiredOption("--fixture <path>", "Notes detail HTML fixture.")
    .option("--book-id <id>", "Goodreads book id for context.")
    .option("--user-slug <slug>", "Goodreads user slug for context.")
    .option("--include-private-ids", "Emit raw annotation pair ids for private local use.", false)
    .option("--json", "Emit JSON.", true)
    .action(
      async (options: {
        fixture: string;
        bookId?: string;
        userSlug?: string;
        includePrivateIds?: boolean;
      }) => {
        printJson(
          await annotationsList({
            fixture: options.fixture,
            bookId: options.bookId,
            userSlug: options.userSlug,
            includePrivateIds: options.includePrivateIds,
          }),
        );
      },
    );

  command
    .command("thoughts-plan")
    .description("Plan a per-note thought write without executing it.")
    .requiredOption("--book-id <id>", "Goodreads book id.")
    .requiredOption("--annotation-pair-id <id>", "Annotation pair id from a private local parse.")
    .option("--json", "Emit JSON.", true)
    .action((options: { bookId: string; annotationPairId: string }) => {
      printJson(
        annotationsThoughtsPlan({
          bookId: options.bookId,
          annotationPairId: options.annotationPairId,
        }),
      );
    });

  return command;
}
