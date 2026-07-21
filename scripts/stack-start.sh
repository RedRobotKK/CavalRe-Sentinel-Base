#!/usr/bin/env bash
# Research stack supervisor.
# Children die with the parent (Ctrl+C / kill / terminal close).
#
# Usage: npm run stack

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p logs run
RPC="${BASE_RPC_URL:-https://mainnet.base.org}"
export BASE_RPC_URL="$RPC"

free_ports() {
  for port in 8787 5173 5174 5175; do
    local extras
    extras=$(lsof -ti :"$port" 2>/dev/null || true)
    if [[ -n "${extras}" ]]; then
      echo "[stack] freeing :$port (pids $extras)"
      kill -TERM $extras 2>/dev/null || true
      sleep 0.2
      kill -KILL $extras 2>/dev/null || true
    fi
  done
}

if [[ -f run/stack.pids ]]; then
  bash scripts/stack-stop.sh >/dev/null 2>&1 || true
fi
free_ports

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
  free_ports
  rm -f run/stack.pids
  echo "[stack] all children stopped"
  exit "$code"
}

trap cleanup EXIT INT TERM HUP

start_one() {
  local name="$1"
  shift
  local log="logs/${name}.log"
  : >"$log"
  echo "[stack] starting ${name} → ${log}"
  env BASE_RPC_URL="$RPC" "$@" >>"$log" 2>&1 &
  local pid=$!
  PIDS+=("$pid")
  NAMES+=("$name")
  echo "$pid $name" >> run/stack.pids
  echo "[stack] $name pid=$pid"
}

: > run/stack.pids

start_one dry-run  npx tsx scripts/dry-run-harness.mjs
start_one desk-api node scripts/desk-api.mjs
start_one desk-web bash -c 'cd apps/desk && npx vite --host 127.0.0.1 --port 5173'

sleep 1.5
for i in "${!PIDS[@]}"; do
  pid="${PIDS[$i]}"
  name="${NAMES[$i]}"
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "[stack] ERROR: $name (pid=$pid) exited during startup"
    echo "[stack] --- logs/${name}.log (tail) ---"
    tail -n 40 "logs/${name}.log" 2>/dev/null || true
    echo "[stack] --- end ---"
    exit 1
  fi
done

cat > run/stack.env <<EOF
BASE_RPC_URL=$RPC
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SUPERVISOR_PID=$$
EOF

echo
echo "[stack] supervisor pid=$$ (keep this terminal open)"
echo "  RPC:     $RPC"
echo "  Desk UI: http://127.0.0.1:5173"
echo "  API:     http://127.0.0.1:8787"
echo "  Logs:    logs/*.log"
echo "  Stop:    Ctrl+C  or  npm run stack:stop"
echo

while true; do
  for i in "${!PIDS[@]}"; do
    pid="${PIDS[$i]}"
    name="${NAMES[$i]}"
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "[stack] child $name pid=$pid exited — shutting down stack"
      echo "[stack] --- logs/${name}.log (tail) ---"
      tail -n 40 "logs/${name}.log" 2>/dev/null || true
      echo "[stack] --- end ---"
      exit 1
    fi
  done
  sleep 2
done
