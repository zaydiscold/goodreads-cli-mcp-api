#!/bin/sh

set -eu
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
AUTH_FILE=${GOODREADS_AUTH_FILE:-"$HOME/.goodreads/auth.sh"}

if [ -f "$AUTH_FILE" ]; then
  AUTH_MODE=$(
    stat -f '%Lp' "$AUTH_FILE" 2>/dev/null ||
      stat -c '%a' "$AUTH_FILE" 2>/dev/null ||
      true
  )
  if [ "$AUTH_MODE" != "600" ]; then
    printf '%s\n' "[goodreads-mcp] refusing auth file with mode ${AUTH_MODE:-unknown}; run: chmod 600 \"$AUTH_FILE\"" >&2
    exit 78
  fi

  # Export plain assignments too, and suppress any accidental output from the
  # credential file so neither values nor chatter can corrupt MCP stdout.
  set -a
  set +e
  # shellcheck disable=SC1090
  . "$AUTH_FILE" >/dev/null 2>&1
  AUTH_STATUS=$?
  set -e
  set +a
  if [ "$AUTH_STATUS" -ne 0 ]; then
    printf '%s\n' "[goodreads-mcp] auth file could not be loaded" >&2
    exit 78
  fi
fi

exec "${GOODREADS_NODE_BIN:-node}" "$SCRIPT_DIR/goodreads-mcp-bootstrap.mjs" "$@"
