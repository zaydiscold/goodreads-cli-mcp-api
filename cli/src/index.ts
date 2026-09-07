#!/usr/bin/env node

import { Command } from "commander";
import { annotationsCommand } from "./commands/annotations.js";
import { apiMapCommand } from "./commands/apiMap.js";
import { bookCommand } from "./commands/book.js";
import { authorCommand, recommendationsCommand } from "./commands/discovery.js";
import { booksCommand } from "./commands/books.js";
import { commentsCommand } from "./commands/comments.js";
import { messagesCommand } from "./commands/messages.js";
import { notesCommand } from "./commands/notes.js";
import { quotesCommand } from "./commands/quotes.js";
import { requestCommand } from "./commands/request.js";
import { recentReadingCommand } from "./commands/recentReading.js";
import { shelvesCommand } from "./commands/shelves.js";
import { statsCommand } from "./commands/stats.js";
import { writePlanCommand } from "./commands/writePlan.js";
import { libraryCommand } from "./commands/libraryCommand.js";
import { searchCommand } from "./commands/search.js";

const program = new Command();

program
  .name("goodreads-cli")
  .description("Unofficial command-line client for Goodreads.")
  .version("1.1.0");

program.addCommand(searchCommand());
program.addCommand(bookCommand());
program.addCommand(authorCommand());
program.addCommand(recommendationsCommand());
program.addCommand(shelvesCommand());
program.addCommand(booksCommand());
program.addCommand(statsCommand());
program.addCommand(libraryCommand());
program.addCommand(notesCommand());
program.addCommand(recentReadingCommand());
program.addCommand(annotationsCommand());
program.addCommand(quotesCommand());
program.addCommand(commentsCommand());
program.addCommand(messagesCommand());

// These commands remain available in the private source tree while the clean
// public CLI is extracted. They are development surfaces, not product identity.
program.addCommand(writePlanCommand());
program.addCommand(apiMapCommand());
program.addCommand(requestCommand());

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
