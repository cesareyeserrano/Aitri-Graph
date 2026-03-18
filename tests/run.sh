#!/usr/bin/env bash
# Run all Aitri tests: unit + integration (with server) + config inspection
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_PORT=3001

# Start server in background on a free port
PORT=$TEST_PORT node "$ROOT/server.js" &
SERVER_PID=$!

# Wait for server to be ready (poll up to 5s)
for i in $(seq 1 10); do
  if curl -s "http://localhost:$TEST_PORT/" > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

# Run all test suites against the test port
PORT=$TEST_PORT node --test \
  "$ROOT/tests/normalizer.test.js" \
  "$ROOT/tests/server.test.js" \
  "$ROOT/tests/config.test.js" \
  "$ROOT/tests/loader.test.js"
EXIT_CODE=$?

# Kill server
kill "$SERVER_PID" 2>/dev/null || true

exit $EXIT_CODE
