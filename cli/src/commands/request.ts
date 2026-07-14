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
    .option("--authenticated", "Plan an authenticated read using GOODREADS_COOKIE.", false)
    .action(
      async (options: {
        route: string;
        param: string[];
        query: string[];
        bodyJson?: string;
        form: string[];
        baseUrl: string;
        authenticated: boolean;
      }) => {
        printJson(
          await requestPlan({
            routeSelector: options.route,
            baseUrl: options.baseUrl,
            pathParams: parsePairs(options.param),
            query: parsePairs(options.query),
            bodyJson: parseJsonInput(options.bodyJson),
            form: parsePairs(options.form),
            authenticated: options.authenticated,
          }),
        );
      },
    );

  command
    .command("execute")
    .description(
      "Run a mapped Goodreads request. Reads run live; mutating routes require --execute and otherwise return a dry-run plan.",
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
    .option("--authenticated", "Send GOODREADS_COOKIE for a Goodreads read route.", false)
    .option(
      "--approved-route <method-and-path-or-id>",
      "Exact route approval required with --execute for mutations.",
    )
    .option("--execute", "Allow a mutating route to write to the live account.", false)
    .option("--dry-run", "Force a preview without sending, even when --execute is present.", false)
    .action(
      async (options: {
        route: string;
        param: string[];
        query: string[];
        bodyJson?: string;
        form: string[];
        authenticated: boolean;
        approvedRoute?: string;
        execute: boolean;
        dryRun: boolean;
      }) => {
        printJson(
          await requestExecute({
            routeSelector: options.route,
            pathParams: parsePairs(options.param),
            query: parsePairs(options.query),
            bodyJson: parseJsonInput(options.bodyJson),
            form: parsePairs(options.form),
            authenticated: options.authenticated,
            approvedRoute: options.approvedRoute,
            execute: options.execute,
            dryRun: options.dryRun,
          }),
        );
      },
    );

  return command;
}
