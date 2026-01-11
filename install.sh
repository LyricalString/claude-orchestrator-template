#!/bin/bash

# Claude Code Orchestrator Template - Basic Install Script
# This script copies the base template files to your project.
#
# NOTE: This is a BASIC install that copies generic template files.
# For intelligent setup with custom agents tailored to your codebase,
# use Claude Code instead:
#
#   1. Run: claude
#   2. Paste: Fetch https://raw.githubusercontent.com/LyricalString/claude-orchestrator-template/main/SETUP_PROMPT.md and follow those instructions
#

set -e

echo "Claude Code Orchestrator - Basic Installation"
echo "=============================================="
echo ""
echo "NOTE: This copies generic template files."
echo "For custom agents tailored to your project, use the SETUP_PROMPT method instead."
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
    echo "Basic installation complete!"
    echo ""
    echo "Files copied:"
    echo "  - .claude/agents/     (GENERIC agent templates)"
    echo "  - .claude/commands/   (slash commands)"
    echo "  - .claude/plans/      (PLAN files directory)"
    echo "  - .claude/logs/       (agent logs directory)"
    echo "  - mcp-orchestrator/   (MCP server)"
    if [ ! -f "AGENTS.md" ]; then
        echo "  - AGENTS.md           (coding guidelines template)"
    fi
    echo ""
    echo "=============================================="
    echo "IMPORTANT: You have GENERIC template agents!"
    echo "=============================================="
    echo ""
    echo "The agents (frontend.md, api.md, database.md) are generic templates."
    echo "You should customize them for your specific project."
    echo ""
    echo "OPTION A: Automatic Customization (Recommended)"
    echo "  Run Claude Code and use /generate-agent to create custom agents:"
    echo "  /generate-agent apps/your-app"
    echo ""
    echo "OPTION B: Manual Customization"
    echo "  1. Edit .claude/agents/orchestrator.md (update routing table)"
    echo "  2. Edit or replace .claude/agents/*.md for your apps"
    echo "  3. Delete unused template agents (api.md, frontend.md, database.md)"
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
    echo "2. Test the setup in Claude Code:"
    echo "   /investigate \"overview of this project\""
    echo ""
}

main "$@"
