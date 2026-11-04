#!/usr/bin/env bash
# Goodreads daily shelf snapshot for WSL/cron. Notes writes remain separately gated.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="${GOODREADS_CLI_DIR:-$(cd -- "$SCRIPT_DIR/.." && pwd)}"
OUT_DIR="${GOODREADS_SYNC_OUT:-$CLI_DIR/proofs/daily-sync}"
GOODREADS_USER="${GOODREADS_USER:-}"
mkdir -p "$OUT_DIR"

cd "$CLI_DIR" || exit 1

echo "=== $(date --iso-8601=seconds) ===" >> "$OUT_DIR/sync.log"

if [[ -z "$GOODREADS_USER" ]]; then
  echo "sync: FAIL (set GOODREADS_USER to a Goodreads user id or slug)" >> "$OUT_DIR/sync.log"
  exit 2
fi

if [[ ! -f cli/dist/index.js ]]; then
  corepack pnpm build >> "$OUT_DIR/sync.log" 2>&1 || {
    echo "build: FAIL" >> "$OUT_DIR/sync.log"
    exit 1
  }
fi

# Goodreads retired the public list_rss shelf feeds around 2026-10-28 (every
# user 404s), so read the shelf as the signed-in user instead. The cookie lives
# in ~/.goodreads/auth.sh (on WSL, link it to the Windows profile copy); it is
# sourced here, never logged.
AUTH_FILE="${GOODREADS_AUTH_FILE:-$HOME/.goodreads/auth.sh}"
if [[ -f "$AUTH_FILE" ]]; then
  # shellcheck disable=SC1090
  source <(tr -d "\r" < "$AUTH_FILE")
fi
if [[ -z "${GOODREADS_COOKIE:-}" ]]; then
  echo "recent-reading: FAIL (no GOODREADS_COOKIE; check $AUTH_FILE)" >> "$OUT_DIR/sync.log"
  exit 1
fi

# The old script invoked the command group without a subcommand and could leave
# a zero-byte file. Write to a temporary file and publish it only after a valid
# signed-in CLI run completes.
STAMP="$(date +%Y%m%d)"
TARGET="$OUT_DIR/recent-reading-$STAMP.json"
TMP="$TARGET.tmp"
if node cli/dist/index.js books list \
  --shelf currently-reading \
  --source html \
  --user "$GOODREADS_USER" \
  --json > "$TMP" 2>> "$OUT_DIR/sync.log" && [[ -s "$TMP" ]] \
  && node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); const d=j.data||j; const p=d.pagination||{}; if (d.signedOut!==false||p.complete!==true||p.parsedCount!==p.declaredCount) { console.error("shelf read signed-out or incomplete; refresh the Goodreads cookie"); process.exit(1); }' "$TMP" 2>> "$OUT_DIR/sync.log"; then
  mv "$TMP" "$TARGET"
  echo "recent-reading: OK" >> "$OUT_DIR/sync.log"
else
  rm -f "$TMP"
  echo "recent-reading: FAIL" >> "$OUT_DIR/sync.log"
  exit 1
fi

# Keep only last 30 days of sync files
find "$OUT_DIR" -name "recent-reading-*.json" -mtime +30 -delete

echo "sync complete" >> "$OUT_DIR/sync.log"
