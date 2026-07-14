import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import {
  CORE_TOOL_NAMES,
  FULL_TOOL_NAMES,
  NOTES_TOOL_NAMES,
  type McpProfile,
} from "../src/profile.js";

const SERVER_PATH = fileURLToPath(new URL("../dist/server.js", import.meta.url));

type RunningClient = {
  client: Client;
  close: () => Promise<void>;
  stderr: () => string;
};

async function connect(
  profile: McpProfile | undefined = "full",
  output: "compact" | "pretty" = "compact",
): Promise<RunningClient> {
  let stderr = "";
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_PATH],
    env: {
      ...getDefaultEnvironment(),
      ...(profile ? { GOODREADS_MCP_PROFILE: profile } : {}),
      GOODREADS_MCP_OUTPUT: output,
    },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const client = new Client({ name: "goodreads-mcp-test", version: "1.0.0" });
  await client.connect(transport);
  return { client, close: () => client.close(), stderr: () => stderr };
}

function textContent(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const block = result.content.find((item) => item.type === "text");
  if (!block || block.type !== "text") throw new Error("tool result did not contain text");
  return block.text;
}

function envelopeData(text: string): Record<string, unknown> {
  const envelope = JSON.parse(text) as { data: Record<string, unknown> };
  return envelope.data;
}

describe("Goodreads MCP stdio server", () => {
  const profiles = [
    { profile: "full" as const, names: FULL_TOOL_NAMES, maxBytes: 17_500 },
    { profile: "core" as const, names: CORE_TOOL_NAMES, maxBytes: 5_000 },
    { profile: "notes" as const, names: NOTES_TOOL_NAMES, maxBytes: 8_500 },
  ];

  it("defaults to the full profile when GOODREADS_MCP_PROFILE is unset", async () => {
    const running = await connect(undefined);
    try {
      const result = await running.client.listTools();
      expect(result.tools.map((tool) => tool.name)).toEqual([...FULL_TOOL_NAMES]);
    } finally {
      await running.close();
    }
  });

  it.each(profiles)(
    "exposes the exact $profile profile within its tools/list budget",
    async ({ profile, names, maxBytes }) => {
      const running = await connect(profile);
      try {
        const result = await running.client.listTools();
        expect(result.tools.map((tool) => tool.name)).toEqual([...names]);
        expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(maxBytes);
        expect(running.stderr()).toBe("");
      } finally {
        await running.close();
      }
    },
  );

  it("emits compact JSON by default and supports an explicit pretty mode", async () => {
    const compact = await connect();
    const pretty = await connect("full", "pretty");
    try {
      const compactText = textContent(
        await compact.client.callTool({
          name: "goodreads_dynamic_inventory_guidance",
          arguments: {},
        }),
      );
      const prettyText = textContent(
        await pretty.client.callTool({
          name: "goodreads_dynamic_inventory_guidance",
          arguments: {},
        }),
      );
      expect(() => JSON.parse(compactText)).not.toThrow();
      expect(compactText).not.toContain("\n");
      expect(prettyText).toContain("\n");
      expect(Buffer.byteLength(compactText)).toBeLessThan(Buffer.byteLength(prettyText));
    } finally {
      await Promise.all([compact.close(), pretty.close()]);
    }
  });

  it("uses bounded route and summarized browser defaults", async () => {
    const running = await connect();
    try {
      const routesText = textContent(
        await running.client.callTool({ name: "goodreads_api_map_routes", arguments: {} }),
      );
      const browserText = textContent(
        await running.client.callTool({ name: "goodreads_browser_routes", arguments: {} }),
      );
      expect(envelopeData(routesText).routeCount).toBe(20);
      expect(Buffer.byteLength(routesText)).toBeLessThan(8_000);
      expect(Buffer.byteLength(browserText)).toBeLessThan(1_000);
    } finally {
      await running.close();
    }
  });

  it("publishes accurate standard safety annotations", async () => {
    const running = await connect();
    try {
      const { tools } = await running.client.listTools();
      const tool = (name: string) => {
        const found = tools.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`missing tool ${name}`);
        return found;
      };

      expect(tool("goodreads_api_map_routes").annotations?.openWorldHint).toBe(false);
      expect(tool("goodreads_book_show").annotations?.openWorldHint).toBe(true);
      expect(tool("goodreads_quotes_remove").annotations?.destructiveHint).toBe(true);
      expect(tool("goodreads_request_execute").annotations?.destructiveHint).toBe(true);
      expect(tool("goodreads_notes_publicize").annotations?.destructiveHint).toBe(false);
      expect(tool("goodreads_notes_publicize").annotations?.readOnlyHint).toBe(false);
      expect(tool("goodreads_notes_inspect").annotations?.openWorldHint).toBe(false);
      expect(tool("goodreads_api_map_routes").annotations).not.toHaveProperty("mcp:risk");
      expect(tool("goodreads_api_map_routes").annotations).not.toHaveProperty("mcp:read-only");
    } finally {
      await running.close();
    }
  });

  it("keeps mutations dry-run unless their explicit execution gates are satisfied", async () => {
    const running = await connect();
    try {
      const notes = await running.client.callTool({
        name: "goodreads_notes_publicize",
        arguments: { bookId: "123" },
      });
      expect(notes.isError).not.toBe(true);
      expect(envelopeData(textContent(notes)).submitted).toBe(false);

      const generic = await running.client.callTool({
        name: "goodreads_request_execute",
        arguments: {
          route: "PUT /notes/{book_id}/share",
          param: ["book_id=123"],
        },
      });
      expect(generic.isError).not.toBe(true);
      expect(envelopeData(textContent(generic)).dryRun).toBe(true);
      expect(envelopeData(textContent(generic)).execute).toBe(false);
    } finally {
      await running.close();
    }
  });
});
