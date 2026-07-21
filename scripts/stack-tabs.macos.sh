#!/usr/bin/env bash
# Open separate macOS Terminal.app tabs for each process.
# Requires Terminal accessibility permission on first run.
# Usage: npm run stack:tabs

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="${BASE_RPC_URL:-https://mainnet.base.org}"

open_tab() {
  local title="$1"
  local cmd="$2"
  osascript <<EOF
tell application "Terminal"
  activate
  do script "cd $(printf %q "$ROOT"); export BASE_RPC_URL=$(printf %q "$RPC"); printf '\\e]0;${title}\\a'; ${cmd}"
end tell
EOF
}

echo "[stack-tabs] opening Terminal tabs (RPC=$RPC)..."
open_tab "sentinel-dry-run" "npm run dry-run"
sleep 0.4
open_tab "sentinel-desk-api" "npm run desk:api"
sleep 0.4
open_tab "sentinel-desk-web" "npm run desk:web"
sleep 0.4
open_tab "sentinel-ops" "echo 'Run when needed: npm run research-ops'; npm run go-no-go'; exec zsh"

echo "[stack-tabs] done — check Terminal.app"
