#!/usr/bin/env bash
# Start research stack in background (no extra terminal tabs required).
# Usage: npm run stack
#        BASE_RPC_URL=https://mainnet.base.org npm run stack

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p logs run
RPC="${BASE_RPC_URL:-https://mainnet.base.org}"
export BASE_RPC_URL="$RPC"

# Stop prior stack if PID file exists
if [[ -f run/stack.pids ]]; then
  echo "Stopping previous stack..."
  bash scripts/stack-stop.sh || true
fi

start_one() {
  local name="$1"
  shift
  local log="logs/${name}.log"
  echo "[stack] starting ${name} → ${log}"
  nohup env BASE_RPC_URL="$RPC" "$@" >>"$log" 2>&1 &
  local pid=$!
  echo "$pid $name" >> run/stack.pids
  echo "[stack] $name pid=$pid"
}

: > run/stack.pids

start_one dry-run   npx tsx scripts/dry-run-harness.mjs
start_one desk-api  node scripts/desk-api.mjs
start_one desk-web  npm run dev -w @cavalre/desk

cat > run/stack.env <<EOF
BASE_RPC_URL=$RPC
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

echo
echo "[stack] up"
echo "  RPC:     $RPC"
echo "  Desk UI: http://127.0.0.1:5173  (or next free Vite port — see logs/desk-web.log)"
echo "  API:     http://127.0.0.1:8787"
echo "  Logs:    logs/dry-run.log logs/desk-api.log logs/desk-web.log"
echo "  Stop:    npm run stack:stop"
echo
echo "Optional later: npm run research-ops"
