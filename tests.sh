#!/bin/bash

# Start the wrangler dev process in the background
npx wrangler dev --port 9011 tests/worker.ts &

# Wait for the wrangler dev process to start
while ! nc -zv localhost 9011; do
  sleep 1
done

# Capture the wrangler dev process ID
wrangler_pid=$!

echo $wrangler_pid
# List all of the child processes that are associated with the wrangler dev process
child_pids=$(pgrep -P $wrangler_pid)

function shutdown() {
  # Kill the wrangler dev process
  kill "$wrangler_pid"
  # Kill all of the child processes
  for child_pid in $child_pids; do
    kill $child_pid
  done
}

# Set up a trap to kill the wrangler_pid process on Ctrl+C
trap shutdown INT

# Run the uvu tests
npx tsm node_modules/uvu/bin.js tests test.ts

shutdown