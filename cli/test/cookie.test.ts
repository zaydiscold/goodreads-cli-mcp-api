import { describe, expect, it } from "vitest";
import {
  explainFetchFailure,
  normalizeGoodreadsCookie,
  publicGoodreadsCookie,
  SEARCH_UNSAFE_COOKIE_NAMES,
} from "../src/client/cookie.js";

describe("normalizeGoodreadsCookie", () => {
  it("dedupes cookie names with last value winning and keeps SSO cookies", () => {
    const raw = "_session_id2=a; at-main=amazon; _session_id2=b; jwt_token=j";
    expect(normalizeGoodreadsCookie(raw)).toBe(
      "_session_id2=b; at-main=amazon; jwt_token=j",
    );
  });

  it("returns empty string for missing input", () => {
    expect(normalizeGoodreadsCookie(undefined)).toBe("");
    expect(normalizeGoodreadsCookie("")).toBe("");
  });

  it("preserves opaque tokens without '='", () => {
    expect(normalizeGoodreadsCookie("secret-cookie")).toBe("secret-cookie");
  });
});

describe("publicGoodreadsCookie", () => {
  it("strips search-unsafe SSO cookies but keeps session/waf/jwt", () => {
    const raw = [
      "_session_id2=grsess",
      "jwt_token=jwt",
      "aws-waf-token=waf",
      "at-main=amazon",
      "session-token=y",
      "locale=en",
    ].join("; ");
    const out = publicGoodreadsCookie(raw);
    expect(out).toContain("_session_id2=grsess");
    expect(out).toContain("jwt_token=jwt");
    expect(out).toContain("aws-waf-token=waf");
    expect(out).toContain("locale=en");
    expect(out).not.toContain("at-main");
    expect(out).not.toContain("session-token");
    expect(SEARCH_UNSAFE_COOKIE_NAMES.has("at-main")).toBe(true);
  });
});

describe("explainFetchFailure", () => {
  it("surfaces redirect loops with actionable guidance", () => {
    const err = Object.assign(new TypeError("fetch failed"), {
      cause: new Error("redirect count exceeded"),
    });
    const out = explainFetchFailure(err, "https://www.goodreads.com/search?q=x");
    expect(out.message).toMatch(/redirect loop/i);
    expect(out.message).toMatch(/SSO|at-main|publicGoodreadsCookie/i);
  });
});
