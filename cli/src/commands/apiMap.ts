import { Command } from "commander";
import { apiMapRoutes, apiMapSearch, browserRoutes } from "../engine.js";
import { printJson } from "../lib.js";

export function apiMapCommand(): Command {
  const command = new Command("api-map").description(
    "Advanced: inspect the bundled runtime route catalog.",
  );

  command
    .command("routes")
    .description("List sanitized routes available to the shared engine.")
    .option("--json", "Emit JSON.", true)
    .action(async () => {
      printJson(await apiMapRoutes());
    });

  command
    .command("search")
    .description("Search the runtime route catalog by capability.")
    .argument(
      "<query>",
      "Search query, for example 'publicize notes' or 'friend requests'.",
    )
    .option("--limit <n>", "Max routes to return.", (value) => Number.parseInt(value, 10), 20)
    .option("--json", "Emit JSON.", true)
    .action(async (query: string, options: { limit: number }) => {
      printJson(await apiMapSearch({ query, limit: options.limit }));
    });

  command
    .command("browser-routes")
    .description("Advanced: inspect sanitized route-capture summaries.")
    .option("--summary", "Emit only a grouped summary.", false)
    .option("--json", "Emit JSON.", true)
    .action(async (options: { summary: boolean }) => {
      printJson(await browserRoutes({ summary: options.summary }));
    });

  return command;
}
