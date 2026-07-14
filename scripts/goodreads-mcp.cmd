@echo off
setlocal EnableExtensions DisableDelayedExpansion

if defined GOODREADS_AUTH_FILE (
  set "AUTH_FILE=%GOODREADS_AUTH_FILE%"
) else (
  set "AUTH_FILE=%USERPROFILE%\.goodreads\auth.bat"
)

if exist "%AUTH_FILE%" (
  call "%AUTH_FILE%" >nul 2>&1
  if errorlevel 1 (
    >&2 echo [goodreads-mcp] auth file could not be loaded
    exit /b 78
  )
)

if defined GOODREADS_NODE_BIN (
  set "NODE_BIN=%GOODREADS_NODE_BIN%"
) else (
  set "NODE_BIN=node"
)

"%NODE_BIN%" "%~dp0goodreads-mcp-bootstrap.mjs" %*
exit /b %ERRORLEVEL%
