#!/bin/bash
#
# Arb Scanner — double-click launcher for macOS.
# Double-click this file in Finder to start the dashboard and open it in your
# browser. Close it by pressing Control+C in the window that opens (or just
# close the window).
#
# This launcher finds the arb-scanner project automatically, so it works even if
# you copy it to the Desktop or drop it in the Dock.

echo "────────────────────────────────────────"
echo "   🎯  Arb Scanner — starting up"
echo "────────────────────────────────────────"
echo

SELF_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"

# A folder is the project if it has both of these files.
is_project() { [ -f "$1/package.json" ] && [ -f "$1/src/server.ts" ]; }

PROJECT=""
for d in \
  "$SELF_DIR" \
  "$SELF_DIR/arb-scanner" \
  "$HOME/pantrypal/arb-scanner" \
  "$HOME/arb-app/arb-scanner" \
  "$HOME/Desktop/pantrypal/arb-scanner" \
  "$HOME/Documents/pantrypal/arb-scanner" \
  "$HOME/Downloads/pantrypal/arb-scanner"; do
  if is_project "$d"; then PROJECT="$d"; break; fi
done

# Last resort: search the home folder for it.
if [ -z "$PROJECT" ]; then
  echo "Looking for the arb-scanner project…"
  FOUND="$(find "$HOME" -maxdepth 6 -type f -path '*/arb-scanner/src/server.ts' 2>/dev/null | head -n1)"
  [ -n "$FOUND" ] && PROJECT="${FOUND%/src/server.ts}"
fi

if [ -z "$PROJECT" ]; then
  echo "⚠️  Couldn't find the arb-scanner project on this Mac."
  echo "    Make sure you've cloned it, e.g.:"
  echo "        cd ~ && git clone https://github.com/mid-zen/pantrypal.git"
  echo "    then double-click this launcher again."
  echo
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi

cd "$PROJECT" || exit 1
echo "Project: $PROJECT"
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
