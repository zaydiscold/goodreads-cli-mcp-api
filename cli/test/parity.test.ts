import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "../src/engine.js";
import { apiMapCommand } from "../src/commands/apiMap.js";
import { annotationsCommand } from "../src/commands/annotations.js";
import { bookCommand } from "../src/commands/book.js";
import { booksCommand } from "../src/commands/books.js";
import { commentsCommand } from "../src/commands/comments.js";
import { messagesCommand } from "../src/commands/messages.js";
import { notesCommand } from "../src/commands/notes.js";
import { quotesCommand } from "../src/commands/quotes.js";
import { recentReadingCommand } from "../src/commands/recentReading.js";
import { requestCommand } from "../src/commands/request.js";
import { shelvesCommand } from "../src/commands/shelves.js";
import { writePlanCommand } from "../src/commands/writePlan.js";

// Walk a commander command tree and collect every leaf command's full path
// (space-joined). A leaf is a command with no subcommands.
function leafPaths(cmd: Command, prefix: string): string[] {
  const subs = (cmd.commands ?? []).filter((sub) => sub.name() !== "help");
  if (subs.length === 0) return [prefix];
  return subs.flatMap((sub) => leafPaths(sub, `${prefix} ${sub.name()}`));
}

const CLI_GROUPS = [
  apiMapCommand(),
  annotationsCommand(),
  shelvesCommand(),
  booksCommand(),
  bookCommand(),
  commentsCommand(),
  messagesCommand(),
  notesCommand(),
  quotesCommand(),
  recentReadingCommand(),
  requestCommand(),
  writePlanCommand()
];

const cliPaths = new Set(CLI_GROUPS.flatMap((group) => leafPaths(group, group.name())));

const mcpServerSource = readFileSync(
  fileURLToPath(new URL("../../mcp/src/server.ts", import.meta.url)),
  "utf8"
);
const registeredTools = new Set(
  [...mcpServerSource.matchAll(/registerTool\(\s*"([^"]+)"/g)].map((match) => match[1])
);

describe("CLI <-> MCP parity (the shared-engine invariant)", () => {
  it("exposes every CLI-backed capability as an actual CLI command", () => {
    for (const capability of CAPABILITIES) {
      if (!capability.cli) continue;
      expect(cliPaths, `capability ${capability.key} missing CLI command '${capability.cli}'`).toContain(capability.cli);
    }
  });

  it("has no orphan CLI commands without a registered capability", () => {
    const capabilityCliPaths = new Set(CAPABILITIES.map((capability) => capability.cli).filter(Boolean));
    for (const path of cliPaths) {
      expect(capabilityCliPaths, `CLI command '${path}' has no capability entry`).toContain(path);
    }
  });

  it("exposes every capability as a registered MCP tool", () => {
    for (const capability of CAPABILITIES) {
      expect(registeredTools, `capability ${capability.key} missing MCP tool '${capability.mcpTool}'`).toContain(
        capability.mcpTool
      );
    }
  });

  it("has no orphan MCP tools without a registered capability", () => {
    const capabilityTools = new Set(CAPABILITIES.map((capability) => capability.mcpTool));
    for (const tool of registeredTools) {
      expect(capabilityTools, `MCP tool '${tool}' has no capability entry`).toContain(tool);
    }
  });

  it("keeps every capability key and MCP tool name unique", () => {
    const keys = CAPABILITIES.map((capability) => capability.key);
    const tools = CAPABILITIES.map((capability) => capability.mcpTool);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(tools).size).toBe(tools.length);
  });
});
