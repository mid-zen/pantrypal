#!/bin/bash
#
# Arb Scanner — double-click launcher for macOS.
# Double-click this file in Finder to start the dashboard and open it in your
# browser. Close it by pressing Control+C in the window that opens (or just
# close the window).
#
# (If double-clicking doesn't run it, right-click → Open the first time, or run
#  `chmod +x start-mac.command` once in Terminal.)

# Move into this script's folder (the arb-scanner project), wherever it lives.
cd "$(dirname "$0")" || exit 1

echo "────────────────────────────────────────"
echo "   🎯  Arb Scanner — starting up"
echo "────────────────────────────────────────"
echo

# Need Node.js.
if ! command -v node >/dev/null 2>&1; then
  echo "⚠️  Node.js isn't installed."
  echo "    Get it (free) at https://nodejs.org — download the macOS LTS installer,"
  echo "    run it, then double-click this launcher again."
  echo
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi

# First run: install dependencies.
if [ ! -d node_modules ]; then
  echo "First run — installing dependencies (about a minute)…"
  if ! npm install; then
    echo
    echo "⚠️  Setup failed. Make sure you have an internet connection and try again."
    read -n 1 -s -r -p "Press any key to close."
    exit 1
  fi
  echo
fi

# Open the browser once the server has had a moment to start.
( sleep 2; open "http://localhost:3000" ) >/dev/null 2>&1 &

echo "Opening  http://localhost:3000  in your browser…"
echo "Leave this window open while you use it. Press Control+C here to stop."
echo

# Start the server (this keeps running until you stop it).
npm run web
