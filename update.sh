#!/bin/bash

# Claude Code Orchestrator - Update Script
# Updates the MCP server and Dashboard without touching data or project configs

set -e

INSTALL_DIR="$HOME/.claude-orchestrator"
REPO_URL="https://github.com/LyricalString/claude-orchestrator-template.git"
TEMP_DIR="/tmp/claude-orc-update-$$"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   Claude Code Orchestrator - Update                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check if installed
if [ ! -d "$INSTALL_DIR/mcp-orchestrator" ]; then
    echo "Error: No installation found at $INSTALL_DIR"
    echo "Run install-global.sh first."
    exit 1
fi

# Stop dashboard if running
if [ -f "$INSTALL_DIR/dashboard.pid" ]; then
    PID=$(cat "$INSTALL_DIR/dashboard.pid")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Stopping running dashboard (PID: $PID)..."
        kill "$PID" 2>/dev/null || true
        sleep 1
    fi
fi

echo "Updating installation at: $INSTALL_DIR"
echo ""

# Clone template
echo "1. Downloading latest version..."
rm -rf "$TEMP_DIR"
git clone --depth 1 "$REPO_URL" "$TEMP_DIR" 2>/dev/null

# Get current version (if any)
OLD_VERSION="unknown"
if [ -f "$INSTALL_DIR/mcp-orchestrator/package.json" ]; then
    OLD_VERSION=$(grep '"version"' "$INSTALL_DIR/mcp-orchestrator/package.json" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')
fi

NEW_VERSION=$(grep '"version"' "$TEMP_DIR/mcp-orchestrator/package.json" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')

echo "   Current version: $OLD_VERSION"
echo "   New version: $NEW_VERSION"
echo ""

# Backup current installation (just in case)
echo "2. Creating backup..."
BACKUP_DIR="$INSTALL_DIR/backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r "$INSTALL_DIR/mcp-orchestrator" "$BACKUP_DIR/" 2>/dev/null || true
cp -r "$INSTALL_DIR/dashboard" "$BACKUP_DIR/" 2>/dev/null || true

# Update MCP orchestrator
echo "3. Updating MCP server..."
rm -rf "$INSTALL_DIR/mcp-orchestrator"
cp -r "$TEMP_DIR/mcp-orchestrator" "$INSTALL_DIR/"

# Update dashboard
echo "4. Updating Dashboard..."
rm -rf "$INSTALL_DIR/dashboard"
cp -r "$TEMP_DIR/dashboard" "$INSTALL_DIR/"

# Update this script
echo "5. Updating update script..."
cp "$TEMP_DIR/update.sh" "$INSTALL_DIR/bin/" 2>/dev/null || true
chmod +x "$INSTALL_DIR/bin/update.sh" 2>/dev/null || true

# Install MCP server dependencies
echo "6. Installing MCP server dependencies..."
cd "$INSTALL_DIR/mcp-orchestrator"
bun install --silent

# Install dashboard dependencies
echo "7. Installing Dashboard dependencies..."
cd "$INSTALL_DIR/dashboard"
bun run install:all --silent

echo "8. Building Dashboard..."
bun run build > /dev/null 2>&1

# Cleanup
echo "9. Cleaning up..."
rm -rf "$TEMP_DIR"

# Remove old backups (keep last 3)
echo "10. Removing old backups..."
ls -dt "$INSTALL_DIR"/backup-* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   Update Complete!                                        ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Updated from $OLD_VERSION to $NEW_VERSION"
echo ""
echo "Backup saved to: $BACKUP_DIR"
echo ""
echo "NOTE: Your project-specific agents and configs are NOT affected."
echo "      Only the MCP server and Dashboard were updated."
echo ""
echo "If you have Claude Code running, restart it to use the new version."
echo ""
