#!/usr/bin/env bash
# Research stack supervisor.
# Runs dry-run + desk-api + desk-web as children of THIS process.
# Killing this process (Ctrl+C, kill, terminal close) stops all children.
#
# Usage:
#   npm run stack
#   BASE_RPC_URL=https://mainnet.base.org npm run stack

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p logs run
RPC="${BASE_RPC_URL:-https://mainnet.base.org}"
export BASE_RPC_URL="$RPC"

# Clean prior pid bookkeeping / stragglers
if [[ -f run/stack.pids ]]; then
  bash scripts/stack-stop.sh >/dev/null 2>&1 || true
fi

PIDS=()
NAMES=()

cleanup() {
  local code=$?
  trap - EXIT INT TERM HUP
  echo
  echo "[stack] parent exiting — stopping children..."
  for i in "${!PIDS[@]}"; do
    local pid="${PIDS[$i]}"
    local name="${NAMES[$i]}"
    if kill -0 "$pid" 2>/dev/null; then
      echo "[stack] stop $name pid=$pid"
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  sleep 0.4
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
  # free ports if anything lingered
  for port in 8787 5173 5174 5175; do
    local extras
    extras=$(lsof -ti :"$port" 2>/dev/null || true)
    if [[ -n "${extras}" ]]; then
      kill -TERM $extras 2>/dev/null || true
    fi
  done
  rm -f run/stack.pids
  echo "[stack] all children stopped"
  exit "$code"
}

trap cleanup EXIT INT TERM HUP

start_one() {
  local name="$1"
  shift
  local log="logs/${name}.log"
  echo "[stack] starting ${name} → ${log}"
  # Same process group lineage (no nohup) so parent death can reap them
  env BASE_RPC_URL="$RPC" "$@" >>"$log" 2>&1 &
  local pid=$!
  PIDS+=("$pid")
  NAMES+=("$name")
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
SUPERVISOR_PID=$$
EOF

echo
echo "[stack] supervisor pid=$$ (keep this terminal open)"
echo "  RPC:     $RPC"
echo "  Desk UI: http://127.0.0.1:5173  (see logs/desk-web.log if port differs)"
echo "  API:     http://127.0.0.1:8787"
echo "  Logs:    logs/*.log"
echo "  Stop:    Ctrl+C  or  npm run stack:stop"
echo

# Wait until any child dies, then tear everything down
while true; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[stack] child pid=$pid exited — shutting down stack"
      exit 1
    fi
  done
  sleep 2
done
