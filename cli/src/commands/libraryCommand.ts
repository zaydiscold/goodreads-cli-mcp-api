import { Command } from "commander";
import { ls, ss, ru, rv } from "../engine.js";

export function libraryCommand(): Command {
  const cmd = new Command("library").description("Read and mutate your Goodreads library.");
  cmd
    .command("show")
    .description("Read current status/rating/review for one book.")
    .requiredOption("--book-id <id>")
    .option("--include-review-id")
    .action(async (o) => {
      process.stdout.write(JSON.stringify(await ls(o), null, 2) + "\n");
    });
  cmd
    .command("set-status")
    .description("Set reading status via POST /shelf/add_to_shelf. Dry-run unless --execute.")
    .requiredOption("--book-id <id>")
    .requiredOption("--status <status>")
    .option("--approved-book-id <ids...>")
    .option("--approved-status <status>")
    .option("--execute", "", false)
    .action(async (o) => {
      process.stdout.write(
        JSON.stringify(
          await ss({
            bookId: o.bookId,
            status: o.status,
            approvedBookId: o.approvedBookId,
            approvedStatus: o.approvedStatus,
            execute: Boolean(o.execute),
          }),
          null,
          2,
        ) + "\n",
      );
    });
  cmd
    .command("rating")
    .description("Set/clear star rating via POST /review/update/{book_id}. Dry-run unless --execute.")
    .requiredOption("--book-id <id>")
    .option("--action <action>", "set")
    .option("--rating <n>")
    .option("--approved-book-id <ids...>")
    .option("--approved-rating <n>")
    .option("--execute", "", false)
    .action(async (o) => {
      const rating = o.rating !== undefined ? Number(o.rating) : undefined;
      const approvedRating = o.approvedRating !== undefined ? Number(o.approvedRating) : undefined;
      const out = await ru({
        bookId: o.bookId,
        action: (o.action || "set") as "set" | "clear",
        rating: Number.isFinite(rating) ? (rating as 1 | 2 | 3 | 4 | 5) : undefined,
        approvedBookId: o.approvedBookId,
        approvedRating: Number.isFinite(approvedRating)
          ? (approvedRating as 1 | 2 | 3 | 4 | 5)
          : undefined,
        execute: Boolean(o.execute),
      });
      process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    });
  cmd
    .command("review")
    .description("Create/update review text via POST /review/update/{book_id}. Dry-run unless --execute.")
    .requiredOption("--book-id <id>")
    .option("--text <text>")
    .option("--approved-book-id <ids...>")
    .option("--approved-text-sha256 <sha>")
    .option("--execute", "", false)
    .action(async (o) => {
      process.stdout.write(
        JSON.stringify(
          await rv({
            bookId: o.bookId,
            reviewText: o.text || "",
            approvedBookId: o.approvedBookId,
            approvedTextSha256: o.approvedTextSha256,
            execute: Boolean(o.execute),
          }),
          null,
          2,
        ) + "\n",
      );
    });
  return cmd;
}
