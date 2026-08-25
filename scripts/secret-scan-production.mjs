#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  "",
  ".cmd",
  ".env",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sh",
  ".ts",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);
const SKIP_PATHS = new Set(["pnpm-lock.yaml"]);
const SKIP_PREFIXES = ["cli/test/", "mcp/test/"];
const RULES = [
  {
    id: "goodreads-cookie-literal",
    pattern: /GOODREADS_COOKIE\s*=\s*(["'])([^"'\n]{20,})\1/gi,
    valueIndex: 2,
  },
  {
    id: "goodreads-csrf-literal",
    pattern: /GOODREADS_CSRF_TOKEN\s*=\s*(["'])([^"'\n]{20,})\1/gi,
    valueIndex: 2,
  },
  {
    id: "goodreads-session-cookie",
    pattern:
      /(?:_session_id2|aws-waf-token|jwt_token|at-main|sess-at-main)=([A-Za-z0-9._%+/=-]{20,})/gi,
    valueIndex: 1,
  },
  {
    id: "goodreads-private-feed-key",
    pattern: /[?&](?:key|authkey|rss_key)=([A-Za-z0-9_-]{16,})/gi,
    valueIndex: 1,
  },
  {
    id: "rails-authenticity-token",
    pattern:
      /(?:authenticity_token|csrf-token)["'\s:=]+([A-Za-z0-9._%+/=-]{24,})/gi,
    valueIndex: 1,
  },
  {
    id: "cookie-header",
    pattern: /\bCookie:\s*([^\n]{24,}=.+)/gi,
    valueIndex: 1,
  },
];

function isPlaceholder(value) {
  const normalized = value.toLowerCase();
  return (
    value.includes("<") ||
    value.includes(">") ||
    value.includes("${") ||
    value.includes("%") ||
    normalized.includes("example") ||
    normalized.includes("placeholder") ||
    normalized.includes("redacted") ||
    normalized.includes("replace-") ||
    normalized.includes("your-")
  );
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

const findings = [];
for (const path of trackedFiles()) {
  if (
    SKIP_PATHS.has(path) ||
    SKIP_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    !TEXT_EXTENSIONS.has(extname(path).toLowerCase())
  ) {
    continue;
  }
  let info;
  try {
    info = statSync(path);
  } catch {
    continue;
  }
  if (!info.isFile() || info.size > MAX_FILE_BYTES) continue;
  const buffer = readFileSync(path);
  if (buffer.includes(0)) continue;
  const text = buffer.toString("utf8");
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      const value = match[rule.valueIndex] ?? "";
      if (!value || isPlaceholder(value)) continue;
      findings.push({
        path,
        line: lineNumber(text, match.index ?? 0),
        rule: rule.id,
      });
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.path}:${finding.line}: potential secret (${finding.rule}); value omitted`);
  }
  process.exitCode = 1;
} else {
  console.log("Secret scan passed. No Goodreads session material or private feed keys detected.");
}
