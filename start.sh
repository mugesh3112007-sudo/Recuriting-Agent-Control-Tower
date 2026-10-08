#!/usr/bin/env bash
# ============================================================
# start.sh — Launch Recruiting Agent Control Tower Backend
# ============================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDFILE="/tmp/opencode/ct-server.pid"
LOGFILE="/tmp/opencode/ct-server.log"
PORT="${1:-8080}"

mkdir -p /tmp/opencode

# Check if already running on port
OLD_PID=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' | head -1 || true)
if [ -n "$OLD_PID" ]; then
    echo "Stopping existing process on port ${PORT} (PID: ${OLD_PID})..."
    kill -TERM "$OLD_PID" 2>/dev/null || true
    sleep 1
fi

echo "Starting Control Tower backend on port ${PORT}..."
cd "$DIR"
nohup python3 server.py "$PORT" > "$LOGFILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PIDFILE"

# Wait for server to be responsive
for i in {1..10}; do
    if curl -s "http://127.0.0.1:${PORT}/api/agent/health" >/dev/null 2>&1; then
        echo "Backend is LIVE at http://127.0.0.1:${PORT}/"
        cat "$LOGFILE"
        exit 0
    fi
    sleep 0.5
done

echo "Backend started (PID: ${NEW_PID}), log at ${LOGFILE}"
cat "$LOGFILE"
