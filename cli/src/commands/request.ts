import { Command } from "commander";
import { parseJsonInput, parsePairs, requestExecute, requestPlan } from "../engine.js";
import { printJson } from "../lib.js";

export function requestCommand(): Command {
  const command = new Command("request").description(
    "Plan or execute live Goodreads web requests.",
  );

  command
    .command("plan")
    .description("Build a request plan without sending it.")
    .requiredOption(
      "--route <id-or-path>",
      "Route id, path, or 'METHOD /path' selector from api-map routes.",
    )
    .option(
      "--param <name=value...>",
      "Path parameter.",
      (value, previous: string[] = []) => [...previous, value],
      [],
    )
    .option(
      "--query <name=value...>",
      "Query parameter.",
      (value, previous: string[] = []) => [...previous, value],
      [],
    )
    .option("--body-json <json>", "JSON body preview.")
    .option(
      "--form <name=value...>",
      "Form body field preview.",
      (value, previous: string[] = []) => [...previous, value],
      [],
    )
    .option("--base-url <url>", "Base URL.", "https://www.goodreads.com")
    .action(
      async (options: {
        route: string;
        param: string[];
        query: string[];
        bodyJson?: string;
        form: string[];
        baseUrl: string;
      }) => {
        printJson(
          await requestPlan({
            routeSelector: options.route,
            baseUrl: options.baseUrl,
            pathParams: parsePairs(options.param),
            query: parsePairs(options.query),
            bodyJson: parseJsonInput(options.bodyJson),
            form: parsePairs(options.form),
          }),
        );
      },
    );

  command
    .command("execute")
    .description(
      "Execute a live Goodreads request. Mutating routes write to the live account unless --dry-run is supplied.",
    )
    .requiredOption(
      "--route <id-or-path>",
      "Route id, path, or 'METHOD /path' selector from api-map routes.",
    )
    .option(
      "--param <name=value...>",
      "Path parameter.",
      (value, previous: string[] = []) => [...previous, value],
      [],
    )
    .option(
      "--query <name=value...>",
      "Query parameter.",
      (value, previous: string[] = []) => [...previous, value],
      [],
    )
    .option("--body-json <json>", "JSON request body.")
    .option(
      "--form <name=value...>",
      "Form body field.",
      (value, previous: string[] = []) => [...previous, value],
      [],
    )
    .option("--base-url <url>", "Base URL.", "https://www.goodreads.com")
    .option("--dry-run", "Preview the live request without sending it.", false)
    .action(
      async (options: {
        route: string;
        param: string[];
        query: string[];
        bodyJson?: string;
        form: string[];
        baseUrl: string;
        dryRun: boolean;
      }) => {
        printJson(
          await requestExecute({
            routeSelector: options.route,
            baseUrl: options.baseUrl,
            pathParams: parsePairs(options.param),
            query: parsePairs(options.query),
            bodyJson: parseJsonInput(options.bodyJson),
            form: parsePairs(options.form),
            dryRun: options.dryRun,
          }),
        );
      },
    );

  return command;
}
