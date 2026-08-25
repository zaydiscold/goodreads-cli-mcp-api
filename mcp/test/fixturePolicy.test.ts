import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveMcpFixture } from "../src/fixturePolicy.js";

const originalRoot = process.env.GOODREADS_MCP_FIXTURE_ROOT;
const originalArbitrary = process.env.GOODREADS_MCP_ALLOW_ARBITRARY_FIXTURES;

afterEach(() => {
  if (originalRoot === undefined) delete process.env.GOODREADS_MCP_FIXTURE_ROOT;
  else process.env.GOODREADS_MCP_FIXTURE_ROOT = originalRoot;
  if (originalArbitrary === undefined) {
    delete process.env.GOODREADS_MCP_ALLOW_ARBITRARY_FIXTURES;
  } else {
    process.env.GOODREADS_MCP_ALLOW_ARBITRARY_FIXTURES = originalArbitrary;
  }
});

describe("MCP fixture policy", () => {
  it("resolves relative paths from the configured fixture root", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodreads-fixture-root-"));
    const fixture = join(root, "book.html");
    await writeFile(fixture, "<html></html>");
    process.env.GOODREADS_MCP_FIXTURE_ROOT = root;

    expect(resolveMcpFixture("book.html")).toBe(realpathSync(fixture));
  });

  it("rejects absolute paths outside the configured root", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodreads-fixture-root-"));
    const outside = await mkdtemp(join(tmpdir(), "goodreads-fixture-outside-"));
    const fixture = join(outside, "private.html");
    await writeFile(fixture, "private");
    process.env.GOODREADS_MCP_FIXTURE_ROOT = root;

    expect(() => resolveMcpFixture(fixture)).toThrow(
      "restricted to GOODREADS_MCP_FIXTURE_ROOT",
    );
  });

  it("rejects traversal and symlink escapes", async () => {
    const parent = await mkdtemp(join(tmpdir(), "goodreads-fixture-parent-"));
    const root = join(parent, "root");
    const outside = join(parent, "outside.html");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(root);
    await writeFile(outside, "private");
    await symlink(outside, join(root, "escape.html"));
    process.env.GOODREADS_MCP_FIXTURE_ROOT = root;

    expect(() => resolveMcpFixture("../outside.html")).toThrow(
      "restricted to GOODREADS_MCP_FIXTURE_ROOT",
    );
    expect(() => resolveMcpFixture("escape.html")).toThrow(
      "restricted to GOODREADS_MCP_FIXTURE_ROOT",
    );
  });

  it("allows an explicit local-only arbitrary fixture override", async () => {
    const root = await mkdtemp(join(tmpdir(), "goodreads-fixture-root-"));
    const outside = await mkdtemp(join(tmpdir(), "goodreads-fixture-outside-"));
    const fixture = join(outside, "private.html");
    await writeFile(fixture, "private");
    process.env.GOODREADS_MCP_FIXTURE_ROOT = root;
    process.env.GOODREADS_MCP_ALLOW_ARBITRARY_FIXTURES = "1";

    expect(resolveMcpFixture(fixture)).toBe(realpathSync(fixture));
  });
});
