#!/bin/bash

# Claude Code Orchestrator - Global Installation Script
# Installs the MCP server and Dashboard globally at ~/.claude-orchestrator/
#
# This only needs to be run ONCE per machine.
# For per-project setup (agents, commands), use SETUP_PROMPT.md with Claude Code.

set -e

INSTALL_DIR="$HOME/.claude-orchestrator"
REPO_URL="https://github.com/LyricalString/claude-orchestrator-template.git"
TEMP_DIR="/tmp/claude-orc-install-$$"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   Claude Code Orchestrator - Global Installation          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check for required tools
check_requirements() {
    if ! command -v git &> /dev/null; then
        echo "Error: git is not installed"
        exit 1
    fi

    if ! command -v bun &> /dev/null; then
        echo "Error: bun is not installed"
        echo "Install it with: curl -fsSL https://bun.sh/install | bash"
        exit 1
    fi
}

# Check if already installed
check_existing() {
    if [ -d "$INSTALL_DIR/mcp-orchestrator" ]; then
        echo "Existing installation found at $INSTALL_DIR"
        echo ""
        read -p "Do you want to update it? (y/n) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Updating installation..."
            UPDATE_MODE=true
        else
            echo "Aborted."
            exit 0
        fi
    else
        UPDATE_MODE=false
    fi
}

# Main installation
main() {
    check_requirements
    check_existing

    echo "Installing to: $INSTALL_DIR"
    echo ""

    # Create install directory
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$INSTALL_DIR/logs"
    mkdir -p "$INSTALL_DIR/bin"

    # Clone template
    echo "1. Downloading latest version..."
    rm -rf "$TEMP_DIR"
    git clone --depth 1 "$REPO_URL" "$TEMP_DIR" 2>/dev/null

    # Copy MCP orchestrator
    echo "2. Installing MCP server..."
    rm -rf "$INSTALL_DIR/mcp-orchestrator"
    cp -r "$TEMP_DIR/mcp-orchestrator" "$INSTALL_DIR/"

    # Copy dashboard
    echo "3. Installing Dashboard..."
    rm -rf "$INSTALL_DIR/dashboard"
    cp -r "$TEMP_DIR/dashboard" "$INSTALL_DIR/"

    # Copy update script
    echo "4. Installing update script..."
    cp "$TEMP_DIR/update.sh" "$INSTALL_DIR/bin/" 2>/dev/null || true
    chmod +x "$INSTALL_DIR/bin/update.sh" 2>/dev/null || true

    # Install MCP server dependencies
    echo "5. Installing MCP server dependencies..."
    cd "$INSTALL_DIR/mcp-orchestrator"
    bun install --silent

    # Install dashboard dependencies
    echo "6. Installing Dashboard dependencies..."
    cd "$INSTALL_DIR/dashboard"
    bun run install:all --silent

    echo "7. Building Dashboard..."
    bun run build --silent

    # Cleanup
    echo "8. Cleaning up..."
    rm -rf "$TEMP_DIR"

    # Summary
    echo ""
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║   Installation Complete!                                  ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo ""
    echo "Installed at: $INSTALL_DIR"
    echo ""
    echo "Files:"
    echo "  - mcp-orchestrator/   MCP server"
    echo "  - dashboard/          Web dashboard"
    echo "  - bin/update.sh       Update script"
    echo "  - logs/               Agent logs (shared)"
    echo "  - orchestrator.db     Database (created on first use)"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "NEXT STEPS:"
    echo ""
    echo "1. Set up a project with Claude Code:"
    echo ""
    echo "   cd your-project"
    echo "   claude"
    echo ""
    echo "   Then paste:"
    echo "   Fetch https://raw.githubusercontent.com/LyricalString/claude-orchestrator-template/main/SETUP_PROMPT.md and follow those instructions"
    echo ""
    echo "2. To update later, run:"
    echo "   ~/.claude-orchestrator/bin/update.sh"
    echo ""
    echo "3. To start the dashboard manually:"
    echo "   cd ~/.claude-orchestrator/dashboard && bun run start"
    echo ""
}

main "$@"
