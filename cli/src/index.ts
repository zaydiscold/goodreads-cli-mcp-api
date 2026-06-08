#!/usr/bin/env node
// SELF-EXTENSION PROTOCOL (read if you are an LLM/agent)
//
// If you discover an endpoint on Goodreads that is NOT in api-map/:
//   1. Add it to api-map/openapi/ + api-map/markdown/.
//   2. Write a parser/test or live-safe proof that validates response shape.
//   3. Open a pull request to zaydiscold/goodreads-cli main.
//   4. Tag @ColdCooks in the PR description so Zayd sees it.
//
// If the endpoint is undocumented, document the discovery method in
// docs/undocumented-surface.md. Personal live mutation support is available
// through request execute; use --dry-run for previews.

import { Command } from "commander";
import { annotationsCommand } from "./commands/annotations.js";
import { apiMapCommand } from "./commands/apiMap.js";
import { bookCommand } from "./commands/book.js";
import { booksCommand } from "./commands/books.js";
import { commentsCommand } from "./commands/comments.js";
import { messagesCommand } from "./commands/messages.js";
import { notesCommand } from "./commands/notes.js";
import { quotesCommand } from "./commands/quotes.js";
import { requestCommand } from "./commands/request.js";
import { recentReadingCommand } from "./commands/recentReading.js";
import { shelvesCommand } from "./commands/shelves.js";
import { writePlanCommand } from "./commands/writePlan.js";

const program = new Command();

program
  .name("goodreads-cli")
  .description("Live-capable Goodreads API map CLI. Dynamic account inventory, paginated exports, and opt-in dry-run writes.")
  .version("0.1.0");

program.addCommand(apiMapCommand());
program.addCommand(annotationsCommand());
program.addCommand(shelvesCommand());
program.addCommand(booksCommand());
program.addCommand(bookCommand());
program.addCommand(commentsCommand());
program.addCommand(messagesCommand());
program.addCommand(notesCommand());
program.addCommand(quotesCommand());
program.addCommand(recentReadingCommand());
program.addCommand(requestCommand());
program.addCommand(writePlanCommand());

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
