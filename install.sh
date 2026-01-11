#!/bin/bash

# Claude Code Orchestrator Template - Install Script
# This script sets up the orchestrator in the current project

set -e

echo "Claude Code Orchestrator - Installation"
echo "========================================"
echo ""

# Check for required tools
check_requirements() {
    if ! command -v git &> /dev/null; then
        echo "Error: git is not installed"
        exit 1
    fi

    if ! command -v bun &> /dev/null; then
        echo "Warning: bun is not installed. Using npm instead."
        PKG_MANAGER="npm"
    else
        PKG_MANAGER="bun"
    fi
}

# Check git status
check_git_status() {
    if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
        echo "Warning: You have uncommitted changes."
        echo ""
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Aborted. Please commit or stash your changes first."
            exit 1
        fi
    fi
}

# Main installation
main() {
    check_requirements
    check_git_status

    PROJECT_DIR=$(pwd)
    TEMP_DIR="/tmp/claude-orc-template-$$"

    echo "Installing to: $PROJECT_DIR"
    echo ""

    # Clone template
    echo "1. Cloning template..."
    git clone --depth 1 https://github.com/LyricalString/claude-orchestrator-template.git "$TEMP_DIR"

    # Copy files
    echo "2. Copying files..."

    # Copy .claude directory
    if [ -d ".claude" ]; then
        echo "   Warning: .claude directory exists. Merging..."
        cp -r "$TEMP_DIR/.claude/agents" .claude/ 2>/dev/null || mkdir -p .claude/agents && cp -r "$TEMP_DIR/.claude/agents/"* .claude/agents/
        cp -r "$TEMP_DIR/.claude/commands" .claude/ 2>/dev/null || mkdir -p .claude/commands && cp -r "$TEMP_DIR/.claude/commands/"* .claude/commands/
        mkdir -p .claude/plans .claude/logs
    else
        cp -r "$TEMP_DIR/.claude" ./
    fi

    # Copy MCP orchestrator
    if [ -d "mcp-orchestrator" ]; then
        echo "   Warning: mcp-orchestrator directory exists. Skipping..."
    else
        cp -r "$TEMP_DIR/mcp-orchestrator" ./
    fi

    # Copy AGENTS.md if it doesn't exist
    if [ ! -f "AGENTS.md" ]; then
        cp "$TEMP_DIR/AGENTS.md" ./
    else
        echo "   Warning: AGENTS.md exists. Skipping..."
    fi

    # Install MCP server dependencies
    echo "3. Installing MCP server dependencies..."
    cd mcp-orchestrator
    if [ "$PKG_MANAGER" = "bun" ]; then
        bun install
    else
        npm install
    fi
    cd ..

    # Cleanup
    echo "4. Cleaning up..."
    rm -rf "$TEMP_DIR"

    # Summary
    echo ""
    echo "Installation complete!"
    echo ""
    echo "Files created:"
    echo "  - .claude/agents/     (agent definitions)"
    echo "  - .claude/commands/   (slash commands)"
    echo "  - .claude/plans/      (PLAN files)"
    echo "  - .claude/logs/       (agent logs)"
    echo "  - mcp-orchestrator/   (MCP server)"
    if [ ! -f "AGENTS.md" ]; then
        echo "  - AGENTS.md           (coding guidelines)"
    fi
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. Configure MCP server in Claude Code settings:"
    echo ""
    echo "   Add to .claude/settings.json or ~/.claude.json:"
    echo ""
    echo '   {'
    echo '     "mcpServers": {'
    echo '       "orchestrator": {'
    echo '         "command": "'$PKG_MANAGER'",'
    echo '         "args": ["run", "mcp-orchestrator/index.ts"],'
    echo '         "env": {'
    echo '           "PROJECT_ROOT": "."'
    echo '         }'
    echo '       }'
    echo '     }'
    echo '   }'
    echo ""
    echo "2. Customize agents for your project:"
    echo "   - Edit .claude/agents/orchestrator.md (routing table)"
    echo "   - Use /generate-agent to create app-specific agents"
    echo "   - Delete unused template agents"
    echo ""
    echo "3. Test the setup in Claude Code:"
    echo "   /investigate \"overview of this project\""
    echo ""
}

main "$@"
