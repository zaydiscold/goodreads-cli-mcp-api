import { Command } from "commander";
import { ls, ss, ru, rv } from "../engine.js";

export function libraryCommand(): Command {
  const cmd = new Command("library").description("Read and mutate your Goodreads library.");
  cmd.command("show").description("Read current status/rating/review for one book.")
    .requiredOption("--book-id <id>").option("--include-review-id")
    .action(async (o) => void process.stdout.write(JSON.stringify(await ls(o), null, 2) + "\n"));
  cmd.command("set-status").description("Set reading status. Dry-run unless --execute.")
    .requiredOption("--book-id <id>").requiredOption("--status <status>")
    .option("--approved-book-id <ids...>").option("--approved-status <status>")
    .option("--execute", "", false)
    .action(async (o) => void process.stdout.write(JSON.stringify(await ss(o), null, 2) + "\n"));
  cmd.command("rating").description("Set/clear star rating. Dry-run unless --execute.")
    .requiredOption("--book-id <id>").option("--action <action>", "set")
    .option("--rating <n>").option("--approved-book-id <ids...>")
    .option("--approved-rating <n>").option("--execute", "", false)
    .action(async (o) => void process.stdout.write(JSON.stringify(await ru({ ...o, action: o.action || "set" }), null, 2) + "\n"));
  cmd.command("review").description("Create/update review text. Dry-run unless --execute.")
    .requiredOption("--book-id <id>").option("--text <text>")
    .option("--approved-book-id <ids...>").option("--approved-text-sha256 <sha>")
    .option("--execute", "", false)
    .action(async (o) => void process.stdout.write(JSON.stringify(await rv({ ...o, reviewText: o.text || "" }), null, 2) + "\n"));
  return cmd;
}
