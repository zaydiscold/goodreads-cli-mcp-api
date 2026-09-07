import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ru, rv } from "../src/workflows/libraryWrites.js";

vi.mock("../src/client/live.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/client/live.js")>()),
  executeLiveRequest: vi.fn().mockResolvedValue({ requestAccepted: true }),
}));

beforeEach(() => {
  vi.stubEnv("GOODREADS_COOKIE", "session-token=synthetic-session");
  vi.stubEnv("GOODREADS_USER_ID", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function writeReview(reviewText: string) {
  return rv({
    bookId: "123",
    reviewText,
    approvedBookId: ["123"],
    approvedTextSha256: createHash("sha256").update(reviewText).digest("hex"),
    execute: true,
  });
}

function clearReview() {
  return writeReview("");
}

function clearRating() {
  return ru({ bookId: "123", action: "clear", approvedBookId: ["123"], execute: true });
}

describe("library mutation verification requires observed account state", () => {
  it.each([
    ["The expected review", true],
    ["A different review", false],
  ] as const)("compares the exact review readback: %s", async (observed, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async () =>
          new Response(`<html><a href="/user/sign_out">Sign Out</a>
          <form action="/review/update/123">
          <textarea name="review[review]">${observed}</textarea></form></html>`),
      ),
    );
    const result = await writeReview("The expected review");
    expect(result).toMatchObject({ data: { mutationVerified: expected } });
    expect(JSON.stringify(result)).not.toContain(observed);
    expect(JSON.stringify(result)).not.toContain("The expected review");
  });

  it.each([
    ["review", clearReview],
    ["rating", clearRating],
  ] as const)("does not verify a cleared %s when account readback fails", async (_name, write) => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    await expect(write()).resolves.toMatchObject({
      data: {
        ok: false,
        outcome: _name === "review" ? "blocked" : "indeterminate",
        mutationVerified: false,
      },
    });
  });

  it.each([
    ["review", clearReview],
    ["rating", clearRating],
  ] as const)("does not verify a cleared %s from unrelated HTML", async (_name, write) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html><h1>Try again later</h1></html>")),
    );
    await expect(write()).resolves.toMatchObject({
      data: {
        ok: false,
        outcome: _name === "review" ? "blocked" : "indeterminate",
        mutationVerified: false,
      },
    });
  });

  it.each([
    ["review", clearReview],
    ["rating", clearRating],
  ] as const)("verifies a cleared %s from the authenticated edit form", async (_name, write) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async () =>
          new Response(`<html><a href="/user/sign_out">Sign Out</a>
          <form action="/review/update/123"><div data-rating="0.0"></div>
          <textarea name="review[review]"></textarea></form></html>`),
      ),
    );
    await expect(write()).resolves.toMatchObject({
      data: { ok: true, outcome: "verified", mutationVerified: true },
    });
  });
});
