#!/bin/bash

# Claude Code Orchestrator - Legacy Install Script
#
# DEPRECATED: This script is kept for backwards compatibility.
#
# The recommended installation method is now:
# 1. Global install: curl -sSL .../install-global.sh | bash
# 2. Project setup: Use SETUP_PROMPT.md with Claude Code
#
# See README.md for details.

set -e

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   Claude Code Orchestrator - Installation                 ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "The installation process has changed!"
echo ""
echo "The orchestrator now uses a HYBRID installation:"
echo ""
echo "  1. GLOBAL (once per machine):"
echo "     MCP server + Dashboard at ~/.claude-orchestrator/"
echo ""
echo "  2. PER-PROJECT (for each project):"
echo "     Custom agents + commands via Claude Code"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "STEP 1: Install globally (if not done already)"
echo ""
echo "  curl -sSL https://raw.githubusercontent.com/LyricalString/claude-orchestrator-template/main/install-global.sh | bash"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "STEP 2: Set up your project"
echo ""
echo "  cd your-project"
echo "  claude"
echo ""
echo "  Then paste:"
echo "  Fetch https://raw.githubusercontent.com/LyricalString/claude-orchestrator-template/main/SETUP_PROMPT.md and follow those instructions"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Ask if user wants to run global install
read -p "Do you want to run the global installation now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Running global installation..."
    echo ""

    # Download and run install-global.sh
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    if [ -f "$SCRIPT_DIR/install-global.sh" ]; then
        # Running from cloned repo
        bash "$SCRIPT_DIR/install-global.sh"
    else
        # Running via curl
        curl -sSL https://raw.githubusercontent.com/LyricalString/claude-orchestrator-template/main/install-global.sh | bash
    fi
else
    echo ""
    echo "Okay! When you're ready, run the commands above."
    echo ""
fi
