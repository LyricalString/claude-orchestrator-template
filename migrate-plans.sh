#!/bin/bash
#
# Migration script for Claude Orchestrator users
# Moves PLAN files from .claude/plans/ to plans/
#
# This change avoids Claude Code permission prompts when writing PLAN files,
# since .claude/ is treated as "self-modification" by Claude Code.
#
# Usage: Run this script from your project root
#   curl -sSL https://raw.githubusercontent.com/LyricalString/claude-orchestrator-template/main/migrate-plans.sh | bash
#
# Or manually:
#   bash migrate-plans.sh

set -e

echo "🔄 Claude Orchestrator - Plans Migration"
echo "========================================="
echo ""

# Check if we're in a project with orchestrator setup
if [ ! -d ".claude" ]; then
    echo "❌ No .claude/ directory found. Are you in a project with Claude Orchestrator?"
    exit 1
fi

# Create new plans directory if it doesn't exist
if [ ! -d "plans" ]; then
    mkdir -p plans
    echo "✅ Created plans/ directory"
else
    echo "ℹ️  plans/ directory already exists"
fi

# Move existing PLAN files if .claude/plans/ exists
if [ -d ".claude/plans" ]; then
    file_count=$(find .claude/plans -name "*.md" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$file_count" -gt 0 ]; then
        echo "📦 Moving $file_count PLAN file(s) from .claude/plans/ to plans/"
        mv .claude/plans/*.md plans/ 2>/dev/null || true
        echo "✅ Files moved successfully"
    else
        echo "ℹ️  No PLAN files found in .claude/plans/"
    fi

    # Remove old directory
    rmdir .claude/plans 2>/dev/null && echo "🗑️  Removed empty .claude/plans/" || true
else
    echo "ℹ️  No .claude/plans/ directory found (already migrated or new install)"
fi

# Update .gitignore if needed
if [ -f ".gitignore" ]; then
    # Check if plans/ is already in .gitignore
    if ! grep -q "^plans/$" .gitignore 2>/dev/null; then
        echo "" >> .gitignore
        echo "# Claude Code plans (session-specific)" >> .gitignore
        echo "plans/" >> .gitignore
        echo "✅ Added plans/ to .gitignore"
    else
        echo "ℹ️  plans/ already in .gitignore"
    fi

    # Remove old .claude/plans/ entry if present
    if grep -q "\.claude/plans" .gitignore 2>/dev/null; then
        # Use sed to remove the line (works on both macOS and Linux)
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' '/\.claude\/plans/d' .gitignore
        else
            sed -i '/\.claude\/plans/d' .gitignore
        fi
        echo "🗑️  Removed old .claude/plans/ from .gitignore"
    fi
fi

# Update references in local files
echo ""
echo "📝 Checking for files that reference .claude/plans/..."

files_to_update=()

# Check common locations for references
for file in ".claude/agents/orchestrator.md" ".claude/commands/investigate.md" ".claude/commands/client-feedback.md" "AGENTS.md"; do
    if [ -f "$file" ] && grep -q "\.claude/plans" "$file" 2>/dev/null; then
        files_to_update+=("$file")
    fi
done

if [ ${#files_to_update[@]} -gt 0 ]; then
    echo "Found ${#files_to_update[@]} file(s) with old references:"
    for file in "${files_to_update[@]}"; do
        echo "  - $file"
    done
    echo ""

    # Check if running interactively (stdin is a terminal)
    # When run via curl | bash, stdin is the script itself, not a terminal
    if [ -t 0 ]; then
        read -p "Update these files? (y/n) " -n 1 -r
        echo ""
    else
        # Non-interactive mode (e.g., curl | bash): try reading from /dev/tty
        if [ -e /dev/tty ]; then
            read -p "Update these files? (y/n) " -n 1 -r < /dev/tty
            echo ""
        else
            # No terminal available, default to yes for automation
            echo "Non-interactive mode detected, auto-updating files..."
            REPLY="y"
        fi
    fi

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        for file in "${files_to_update[@]}"; do
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' 's|\.claude/plans/|plans/|g' "$file"
            else
                sed -i 's|\.claude/plans/|plans/|g' "$file"
            fi
            echo "✅ Updated $file"
        done
    else
        echo "⏭️  Skipped file updates (you can update manually)"
    fi
else
    echo "✅ No files need updating"
fi

echo ""
echo "========================================="
echo "✅ Migration complete!"
echo ""
echo "PLAN files will now be created in plans/ instead of .claude/plans/"
echo "This avoids permission prompts when Claude Code writes PLAN files."
echo ""
echo "If you have any issues, please report them at:"
echo "https://github.com/LyricalString/claude-orchestrator-template/issues"
