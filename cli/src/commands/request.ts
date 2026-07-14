import { Command } from "commander";
import { parseJsonInput, parsePairs, requestExecute, requestPlan } from "../engine.js";
import { printJson } from "../lib.js";

interface RequestInputOptions {
  route: string;
  param: string[];
  query: string[];
  bodyJson?: string;
  form: string[];
  authenticated: boolean;
}

interface PlanOptions extends RequestInputOptions {
  baseUrl: string;
}

interface ExecuteOptions extends RequestInputOptions {
  approvedRoute?: string;
  execute: boolean;
  dryRun: boolean;
}

function appendValue(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function requestInputs(command: Command, preview: boolean): Command {
  const bodyLabel = preview ? "JSON body preview." : "JSON request body.";
  const formLabel = preview ? "Form body field preview." : "Form body field.";
  return command
    .requiredOption(
      "--route <id-or-path>",
      "Route id, path, or 'METHOD /path' selector from api-map routes.",
    )
    .option("--param <name=value...>", "Path parameter.", appendValue, [])
    .option("--query <name=value...>", "Query parameter.", appendValue, [])
    .option("--body-json <json>", bodyLabel)
    .option("--form <name=value...>", formLabel, appendValue, []);
}

function planCommand(): Command {
  return requestInputs(
    new Command("plan").description("Build a request plan without sending it."),
    true,
  )
    .option("--base-url <url>", "Base URL.", "https://www.goodreads.com")
    .option("--authenticated", "Plan an authenticated read using GOODREADS_COOKIE.", false)
    .action(async (options: PlanOptions) => {
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
    });
}

function executeCommand(): Command {
  return requestInputs(
    new Command("execute").description(
      "Run a mapped Goodreads request. Reads run live; mutating routes require --execute and otherwise return a dry-run plan.",
    ),
    false,
  )
    .option("--authenticated", "Send GOODREADS_COOKIE for a Goodreads read route.", false)
    .option(
      "--approved-route <method-and-path-or-id>",
      "Exact route approval required with --execute for mutations.",
    )
    .option("--execute", "Allow a mutating route to write to the live account.", false)
    .option("--dry-run", "Force a preview without sending, even when --execute is present.", false)
    .action(async (options: ExecuteOptions) => {
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
    });
}

export function requestCommand(): Command {
  return new Command("request")
    .description("Plan or execute live Goodreads web requests.")
    .addCommand(planCommand())
    .addCommand(executeCommand());
}
