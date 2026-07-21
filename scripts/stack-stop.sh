#!/usr/bin/env bash
# Stop background stack started by stack-start.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f run/stack.pids ]]; then
  echo "[stack] no run/stack.pids — nothing to stop"
  # best-effort cleanup of known ports
  for port in 8787 5173 5174 5175; do
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [[ -n "${pids}" ]]; then
      echo "[stack] freeing :$port → $pids"
      kill $pids 2>/dev/null || true
    fi
  done
  exit 0
fi

while read -r pid name; do
  [[ -z "${pid:-}" ]] && continue
  if kill -0 "$pid" 2>/dev/null; then
    echo "[stack] stop $name pid=$pid"
    kill "$pid" 2>/dev/null || true
    sleep 0.2
    kill -9 "$pid" 2>/dev/null || true
  else
    echo "[stack] $name pid=$pid already dead"
  fi
done < run/stack.pids

rm -f run/stack.pids
echo "[stack] stopped"
