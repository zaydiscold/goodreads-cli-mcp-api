import { Command } from "commander";
import { buildLiveRequestPlan, executeLiveRequest, type LiveExecuteOptions } from "../client/live.js";
import { envelope, loadApiMapRoutes, printJson, type GoodreadsRoute } from "../lib.js";
import { emitLiveMutationWarning, riskLevelForRoute } from "../risk.js";

const MOVE_ROUTES = {
  up: "POST /quotes/move_up/{quote_id}",
  down: "POST /quotes/move_down/{quote_id}",
  top: "POST /quotes/move_top/{quote_id}",
  bottom: "POST /quotes/move_bottom/{quote_id}"
} as const;

type MoveDirection = keyof typeof MOVE_ROUTES;

async function routeBySelector(selector: string): Promise<GoodreadsRoute> {
  const route = (await loadApiMapRoutes()).find((candidate) => `${candidate.method} ${candidate.path}` === selector);
  if (!route) throw new Error(`${selector} is missing from the api-map`);
  return route;
}

// Quote writes default to dry-run; --execute fires the live Rails-UJS POST.
async function runWrite(
  route: GoodreadsRoute,
  options: LiveExecuteOptions,
  execute: boolean,
  verificationRequired: string
): Promise<void> {
  const dryRun = !execute;
  if (dryRun) {
    printJson(
      envelope(
        { ...buildLiveRequestPlan(route, { ...options, dryRun: true }), riskLevel: riskLevelForRoute(route), submitted: false },
        { warnings: ["dry-run: pass --execute to send this live write"], confidence: "high" }
      )
    );
    return;
  }
  emitLiveMutationWarning(route);
  const result = await executeLiveRequest(route, { ...options, dryRun: false });
  printJson(envelope({ submitted: true, result, verificationRequired }));
}

export function quotesCommand(): Command {
  const command = new Command("quotes").description("Add, remove, and reorder your Goodreads quotes (writes default to dry-run).");

  command
    .command("add")
    .description("Add (create) a quote. Dry-run unless --execute. POST /quotes.")
    .requiredOption("--body <text>", "The quote text.")
    .requiredOption("--author <name>", "The quote's author name.")
    .option("--title <title>", "Optional source/book title.")
    .option("--tags <tags>", "Optional comma-separated tags.")
    .option("--execute", "Actually send the live write.", false)
    .option("--json", "Emit JSON.", true)
    .action(async (options: { body: string; author: string; title?: string; tags?: string; execute?: boolean }) => {
      const route = await routeBySelector("POST /quotes");
      const form: Record<string, string> = {
        "quote[body]": options.body,
        "quote[author_name]": options.author
      };
      if (options.title) form["quote[title]"] = options.title;
      if (options.tags) form["quote[tags]"] = options.tags;
      await runWrite(route, { form }, Boolean(options.execute), "Reload /quotes/list and confirm the new quote appears.");
    });

  command
    .command("remove")
    .description("Remove one quote from your collection by slug. Dry-run unless --execute. POST /quotes/{quote_slug}/remove.")
    .requiredOption("--quote-slug <slug>", "Quote slug, for example 22890102-dreams-come-true-when-you-don-t-sleep.")
    .option("--execute", "Actually send the live write.", false)
    .option("--json", "Emit JSON.", true)
    .action(async (options: { quoteSlug: string; execute?: boolean }) => {
      const route = await routeBySelector("POST /quotes/{quote_slug}/remove");
      await runWrite(
        route,
        { pathParams: { quote_slug: options.quoteSlug }, query: { return_url: "/quotes/list" } },
        Boolean(options.execute),
        "Reload /quotes/list and confirm the quote is gone."
      );
    });

  command
    .command("reorder")
    .description("Reorder one quote (up|down|top|bottom). Dry-run unless --execute. POST /quotes/move_*/{quote_id}.")
    .requiredOption("--quote-id <id>", "Numeric quote id (from the reorder controls on /quotes/list).")
    .requiredOption("--direction <dir>", "One of: up, down, top, bottom.")
    .option("--execute", "Actually send the live write.", false)
    .option("--json", "Emit JSON.", true)
    .action(async (options: { quoteId: string; direction: string; execute?: boolean }) => {
      const direction = options.direction.toLowerCase() as MoveDirection;
      if (!(direction in MOVE_ROUTES)) {
        throw new Error(`--direction must be one of up, down, top, bottom (got ${options.direction})`);
      }
      const route = await routeBySelector(MOVE_ROUTES[direction]);
      await runWrite(
        route,
        { pathParams: { quote_id: options.quoteId } },
        Boolean(options.execute),
        "Reload /quotes/list and confirm the new ordering."
      );
    });

  return command;
}
