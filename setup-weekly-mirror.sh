#!/usr/bin/env bash
#
# OpenBooks — install the mirror daemon as a weekly macOS launchd job.
# Runs `node mirror-daemon.js --once` every Sunday at 03:15 local time.
#
# Usage:
#   ./setup-weekly-mirror.sh            # install (or re-install) the job
#   ./setup-weekly-mirror.sh --uninstall
#
set -euo pipefail

LABEL="com.openbooks.mirrors"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

# Absolute path to this repo (directory containing this script)
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve node's absolute path (launchd has a minimal PATH)
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "✗ node not found in PATH. Install Node.js (https://nodejs.org) first."
  exit 1
fi

uninstall() {
  if [ -f "$PLIST" ]; then
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "✓ Removed weekly mirror job ($LABEL)."
  else
    echo "Nothing to remove — $PLIST does not exist."
  fi
}

if [ "${1:-}" = "--uninstall" ]; then
  uninstall
  exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>              <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${REPO}/mirror-daemon.js</string>
    <string>--once</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>  <integer>0</integer>   <!-- 0 = Sunday -->
    <key>Hour</key>     <integer>3</integer>
    <key>Minute</key>   <integer>15</integer>
  </dict>
  <key>WorkingDirectory</key>   <string>${REPO}</string>
  <key>StandardOutPath</key>    <string>${REPO}/data/mirror.log</string>
  <key>StandardErrorPath</key>  <string>${REPO}/data/mirror.log</string>
</dict>
</plist>
PLISTEOF

# Reload (unload first in case it already exists)
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "✓ Installed weekly mirror job."
echo "  Label:    $LABEL"
echo "  Schedule: every Sunday 03:15 local time"
echo "  Node:     $NODE_BIN"
echo "  Repo:     $REPO"
echo "  Log:      $REPO/data/mirror.log"
echo ""
echo "Run now to test:  node mirror-daemon.js --once"
echo "Uninstall:        ./setup-weekly-mirror.sh --uninstall"
