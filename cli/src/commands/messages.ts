import { Command } from "commander";
import { messagesFolders, messagesList } from "../engine.js";
import { printJson } from "../lib.js";

export function messagesCommand(): Command {
  const command = new Command("messages").description("Read-only message folder helpers.");

  command
    .command("folders")
    .description("List currently mapped Goodreads message folders.")
    .option("--fixture <path>", "Optional inbox HTML fixture for provenance.")
    .action(async (options: { fixture?: string }) => {
      printJson(await messagesFolders({ fixture: options.fixture }));
    });

  command
    .command("list")
    .description("Parse a message folder fixture into redacted message metadata.")
    .requiredOption("--fixture <path>", "Local message folder HTML fixture.")
    .option("--json", "Emit JSON.", true)
    .action(async (options: { fixture: string }) => {
      printJson(await messagesList({ fixture: options.fixture }));
    });

  return command;
}
