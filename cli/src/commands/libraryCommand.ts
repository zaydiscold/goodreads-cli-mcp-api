import { Command } from "commander";
import { ls, ss, ru, rv } from "../engine.js";

function out(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function star(n: unknown): 1 | 2 | 3 | 4 | 5 | undefined {
  const v = n === undefined ? Number.NaN : Number(n);
  if (!Number.isFinite(v) || v < 1 || v > 5) return undefined;
  return v as 1 | 2 | 3 | 4 | 5;
}

export function libraryCommand(): Command {
  const cmd = new Command("library").description("Read and mutate your Goodreads library.");
  cmd.command("show").description("Read current status/rating/review for one book.")
    .requiredOption("--book-id <id>").option("--include-review-id")
    .action(async (o) => out(await ls(o)));
  cmd.command("set-status").description("Set reading status via POST /shelf/add_to_shelf.")
    .requiredOption("--book-id <id>").requiredOption("--status <status>")
    .option("--approved-book-id <ids...>").option("--approved-status <status>")
    .option("--execute", "", false)
    .action(async (o) => out(await ss({
      bookId: o.bookId, status: o.status, approvedBookId: o.approvedBookId,
      approvedStatus: o.approvedStatus, execute: Boolean(o.execute),
    })));
  cmd.command("rating").description("Set/clear star rating via POST /review/update/{book_id}.")
    .requiredOption("--book-id <id>").option("--action <action>", "set")
    .option("--rating <n>").option("--approved-book-id <ids...>")
    .option("--approved-rating <n>").option("--execute", "", false)
    .action(async (o) => out(await ru({
      bookId: o.bookId, action: (o.action || "set") as "set" | "clear", rating: star(o.rating),
      approvedBookId: o.approvedBookId, approvedRating: star(o.approvedRating),
      execute: Boolean(o.execute),
    })));
  cmd.command("review").description("Create/update review via POST /review/update/{book_id}.")
    .requiredOption("--book-id <id>").option("--text <text>")
    .option("--approved-book-id <ids...>").option("--approved-text-sha256 <sha>")
    .option("--execute", "", false)
    .action(async (o) => out(await rv({
      bookId: o.bookId, reviewText: o.text || "", approvedBookId: o.approvedBookId,
      approvedTextSha256: o.approvedTextSha256, execute: Boolean(o.execute),
    })));
  return cmd;
}
