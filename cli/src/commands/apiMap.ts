import { Command } from "commander";
import { apiMapRoutes, apiMapSearch, browserRoutes } from "../engine.js";
import { printJson } from "../lib.js";

export function apiMapCommand(): Command {
  const command = new Command("api-map").description("Inspect the bundled Goodreads API map.");

  command
    .command("routes")
    .description("List mapped routes from api-map/openapi/undocumented/goodreads-web.yaml.")
    .option("--json", "Emit JSON.", true)
    .action(async () => {
      printJson(await apiMapRoutes());
    });

  command
    .command("search")
    .description("Search mapped Goodreads routes by natural-language capability.")
    .argument("<query>", "Search query, for example 'publicize notes' or 'friend requests'.")
    .option("--limit <n>", "Max routes to return.", (value) => Number.parseInt(value, 10), 20)
    .option("--json", "Emit JSON.", true)
    .action(async (query: string, options: { limit: number }) => {
      printJson(await apiMapSearch({ query, limit: options.limit }));
    });

  command
    .command("browser-routes")
    .description("List sanitized authenticated Chrome CDP route templates captured from Goodreads.")
    .option("--summary", "Emit only a grouped summary.", false)
    .option("--json", "Emit JSON.", true)
    .action(async (options: { summary: boolean }) => {
      printJson(await browserRoutes({ summary: options.summary }));
    });

  return command;
}
