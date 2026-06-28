#!/bin/bash
# Goodreads daily sync — pulls latest reading data via goodreads-cli
# Runs from WSL, writes to the Windows Desktop.

# Config: point these at your own setup
CLI_DIR="${GOODREADS_CLI_DIR:-/mnt/c/Users/$USER/Desktop/clis and apis/goodreads-cli}"
OUT_DIR="${GOODREADS_SYNC_OUT:-/mnt/c/Users/$USER/Desktop/career/goodreads-sync}"
mkdir -p "$OUT_DIR"

cd "$CLI_DIR" || exit 1

echo "=== $(date) ===" >> "$OUT_DIR/sync.log"

# Pull latest reading + notes metadata
node cli/dist/index.js recent-reading --json 2>/dev/null > "$OUT_DIR/recent-reading-$(date +%Y%m%d).json" && \
  echo "recent-reading: OK" >> "$OUT_DIR/sync.log" || \
  echo "recent-reading: FAIL" >> "$OUT_DIR/sync.log"

# Keep only last 30 days of sync files
find "$OUT_DIR" -name "recent-reading-*.json" -mtime +30 -delete

echo "sync complete" >> "$OUT_DIR/sync.log"
