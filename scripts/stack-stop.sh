#!/usr/bin/env bash
# Stop stack: kill supervisor if known, else kill pids / ports.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f run/stack.env ]]; then
  # shellcheck disable=SC1091
  source run/stack.env 2>/dev/null || true
  if [[ -n "${SUPERVISOR_PID:-}" ]] && kill -0 "$SUPERVISOR_PID" 2>/dev/null; then
    echo "[stack] stopping supervisor pid=$SUPERVISOR_PID"
    kill -TERM "$SUPERVISOR_PID" 2>/dev/null || true
    sleep 0.5
    kill -KILL "$SUPERVISOR_PID" 2>/dev/null || true
  fi
fi

if [[ -f run/stack.pids ]]; then
  while read -r pid name; do
    [[ -z "${pid:-}" ]] && continue
    if kill -0 "$pid" 2>/dev/null; then
      echo "[stack] stop $name pid=$pid"
      kill -TERM "$pid" 2>/dev/null || true
      sleep 0.15
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done < run/stack.pids
  rm -f run/stack.pids
fi

for port in 8787 5173 5174 5175; do
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [[ -n "${pids}" ]]; then
    echo "[stack] freeing :$port"
    kill -TERM $pids 2>/dev/null || true
  fi
done

echo "[stack] stopped"
