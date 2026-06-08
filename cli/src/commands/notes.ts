import { Command } from "commander";
import { buildLiveRequestPlan, executeLiveRequest } from "../client/live.js";
import { envelope, loadApiMapRoutes, printJson, readText } from "../lib.js";
import { parseNotesPage } from "../parsers/notesPage.js";
import { emitLiveMutationWarning } from "../risk.js";
import { buildNotesPublicizeWorkflowPlan, checkPublicizeApproval } from "../workflows/recentReading.js";

async function notesShareRoute() {
  const route = (await loadApiMapRoutes()).find((candidate) => `${candidate.method} ${candidate.path}` === "PUT /notes/{book_id}/share");
  if (!route) throw new Error("PUT /notes/{book_id}/share is missing from the api-map");
  return route;
}

export function notesCommand(): Command {
  const command = new Command("notes").description("Read Kindle notes/highlights metadata without raw highlight text.");

  command
    .command("inspect")
    .description("Parse notes index or book-detail HTML into redacted metadata.")
    .requiredOption("--fixture <path>", "Local notes HTML fixture.")
    .option("--json", "Emit JSON.", true)
    .action(async (options: { fixture: string }) => {
      const parsed = parseNotesPage(await readText(options.fixture));
      printJson(envelope(parsed, { confidence: parsed.noteCount > 0 || parsed.noteBookLinks.length > 0 ? "high" : "medium" }));
    });

  command
    .command("publicize-plan")
    .description("Build the verified workflow plan for publicizing one book's notes/highlights. This does not submit anything.")
    .requiredOption("--book-id <id>", "Goodreads book id.")
    .option("--book-slug <slug>", "Goodreads notes detail book slug, for example 218134959-mr-whisper.")
    .option("--user-slug <slug>", "Goodreads user slug for reload verification.")
    .option("--detail-fixture <path>", "Optional notes detail HTML fixture for count/visibility preflight.")
    .option("--approved-book-id <id>", "Book id approved for publicizing.", (value, previous: string[] = []) => [...previous, value], [])
    .option("--json", "Emit JSON.", true)
    .action(async (options: { bookId: string; bookSlug?: string; userSlug?: string; detailFixture?: string; approvedBookId: string[] }) => {
      const plan = await buildNotesPublicizeWorkflowPlan({
        bookId: options.bookId,
        bookSlug: options.bookSlug,
        userSlug: options.userSlug,
        detailFixture: options.detailFixture,
        approvedBookIds: options.approvedBookId ?? []
      });
      printJson(envelope(plan, { warnings: plan.blockers, confidence: options.detailFixture ? "high" : "medium" }));
    });

  command
    .command("publicize")
    .description("Execute the approved notes-publicize workflow. Requires --execute, exact approved book id, and GOODREADS_ALLOW_NOTES_PUBLICIZE=1.")
    .requiredOption("--book-id <id>", "Goodreads book id.")
    .option("--approved-book-id <id>", "Book id approved for publicizing.", (value, previous: string[] = []) => [...previous, value], [])
    .option("--execute", "Actually send PUT /notes/{book_id}/share.", false)
    .option("--dry-run", "Preview the request even if execute gates are present.", false)
    .option("--json", "Emit JSON.", true)
    .action(async (options: { bookId: string; approvedBookId: string[]; execute?: boolean; dryRun?: boolean }) => {
      const route = await notesShareRoute();
      const approval = checkPublicizeApproval({
        bookId: options.bookId,
        approvedBookIds: options.approvedBookId ?? [],
        execute: Boolean(options.execute)
      });
      const requestPlan = buildLiveRequestPlan(route, {
        pathParams: { book_id: options.bookId },
        dryRun: !options.execute || options.dryRun || approval.blockers.length > 0
      });
      if (!options.execute || options.dryRun || approval.blockers.length > 0) {
        printJson(envelope({ approval, requestPlan, submitted: false }, { warnings: approval.blockers, confidence: "high" }));
        return;
      }

      emitLiveMutationWarning(route);
      const result = await executeLiveRequest(route, { pathParams: { book_id: options.bookId }, form: { visible: "true" }, dryRun: false });
      printJson(
        envelope({
          approval,
          submitted: true,
          result,
          verificationRequired: "Reload the notes detail page and verify visible count equals total note count before claiming success."
        })
      );
    });

  command
    .command("hide")
    .description("Execute the approved notes-hide workflow. Requires --execute, exact approved book id, and GOODREADS_ALLOW_NOTES_PUBLICIZE=1.")
    .requiredOption("--book-id <id>", "Goodreads book id.")
    .option("--approved-book-id <id>", "Book id approved for hiding.", (value, previous: string[] = []) => [...previous, value], [])
    .option("--execute", "Actually send PUT /notes/{book_id}/share with visible=false.", false)
    .option("--dry-run", "Preview the request even if execute gates are present.", false)
    .option("--json", "Emit JSON.", true)
    .action(async (options: { bookId: string; approvedBookId: string[]; execute?: boolean; dryRun?: boolean }) => {
      const route = await notesShareRoute();
      const approval = checkPublicizeApproval({
        bookId: options.bookId,
        approvedBookIds: options.approvedBookId ?? [],
        execute: Boolean(options.execute)
      });
      const requestPlan = buildLiveRequestPlan(route, {
        pathParams: { book_id: options.bookId },
        form: { visible: "false" },
        dryRun: !options.execute || options.dryRun || approval.blockers.length > 0
      });
      if (!options.execute || options.dryRun || approval.blockers.length > 0) {
        printJson(envelope({ approval, requestPlan, submitted: false }, { warnings: approval.blockers, confidence: "high" }));
        return;
      }

      emitLiveMutationWarning(route);
      const result = await executeLiveRequest(route, { pathParams: { book_id: options.bookId }, form: { visible: "false" }, dryRun: false });
      printJson(
        envelope({
          approval,
          submitted: true,
          result,
          verificationRequired: "Reload the notes detail page and verify visible count equals zero before claiming success."
        })
      );
    });

  return command;
}
