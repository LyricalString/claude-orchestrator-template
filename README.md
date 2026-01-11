# Claude Code Orchestrator Template

A powerful multi-agent orchestration system for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Handle complex tasks with parallel agent coordination, persistent PLAN file tracking, and app-specific specialists using an MCP server.

---

## Quick Install (Recommended)

> **Requires**: [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed (`npm install -g @anthropic-ai/claude-code`)

### Step 1: Open Claude Code in your project

```bash
cd your-project
claude
```

### Step 2: Send this message

Copy and paste this into Claude Code:

```
Fetch https://raw.githubusercontent.com/LyricalString/claude-orchestrator-template/main/SETUP_PROMPT.md and follow those instructions to set up the orchestrator in my project
```

### Step 3: Follow the prompts

Claude will analyze your codebase and create **custom agents tailored to your project**. This is an intelligent setup that:

#### Phase 1: Pre-flight

- Check git status (offers to stash uncommitted changes)
- Download and copy template files
- Install MCP server dependencies

#### Phase 2: Documentation Discovery

- Scan for README, CONTRIBUTING, ARCHITECTURE, existing AGENTS.md
- Present findings and ask for any additional context

#### Phase 3: Project Analysis (4 parallel agents)

- **Stack Agent**: Detect monorepo tools, languages, frameworks, package manager
- **Apps Agent**: Find all apps/packages with their purpose
- **Services Agent**: Detect database, auth, external integrations
- **Quality Agent**: Find test frameworks, linters, CI/CD

#### Phase 4: AGENTS.md

- If you have one: Propose merge with orchestrator additions
- If not: Generate one based on your conventions

#### Phase 5: Agent Generation

- Update orchestrator routing table
- Generate specialized agent for each app (in parallel)
- Clean up unused template agents
- Configure MCP server in `claude_desktop_config.json`

#### Phase 6: Summary

- Show what was created
- Test command to verify setup

---

## What is This?

An orchestrated workflow for Claude Code, designed for monorepos with multiple apps. Uses an MCP server to spawn and coordinate subagents:

```
/client-feedback "user reports login is broken on mobile"
                    │
                    ▼
    ┌───────────────────────────────────┐
    │  PHASE 1: INVESTIGATION           │
    │  • Parallel subagents (via MCP)   │
    │  • Create PLAN.md                 │
    │  • NO code changes                │
    └───────────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────┐
    │  PHASE 2: PLANNING                │
    │  • Review findings                │
    │  • Create implementation plan     │
    │  • Get user approval              │
    └───────────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────┐
    │  PHASE 3: IMPLEMENTATION          │
    │  • Launch app-specific agents     │
    │  • Parallel when possible         │
    │  • Type-check at the end          │
    └───────────────────────────────────┘
```

---

## MCP Orchestrator

The orchestrator uses an MCP server that provides these tools:

| Tool | Purpose |
| ---- | ------- |
| `mcp__orchestrator__spawn_agent` | Launch a subagent with a specific task |
| `mcp__orchestrator__get_agent_status` | Check status and read output of an agent |
| `mcp__orchestrator__list_agents` | List all available and spawned agents |
| `mcp__orchestrator__kill_agent` | Terminate a running agent |
| `mcp__orchestrator__read_agent_log` | Read the full log of an agent |

---

## Commands

After installation, these commands are available:

| Command                  | Description              |
| ------------------------ | ------------------------ |
| `/client-feedback "..."` | Full 3-phase workflow    |
| `/investigate "..."`     | Phase 1 only (read-only) |
| `/plan-fix`              | Phase 2 only             |
| `/implement`             | Phase 3 only             |
| `/continue-plan FILE.md` | Resume from PLAN file    |
| `/generate-agent path/`  | Create agent for new app |
| `/update-agent name`     | Update existing agent    |

---

## How It Works

### Orchestrator

Routes tasks to the right app-specific agents, coordinates parallel execution, maintains the PLAN file. Uses MCP tools to spawn subagents.

### App Agents

Each app gets a specialist agent that knows its tech stack, patterns, and conventions. Agents are defined in `.claude/agents/`.

> **Design principle**: Agents capture **patterns over specifics** - they document directory structures, coding conventions, and integration types, but NOT version numbers, function names, or config values. This prevents hallucination and keeps agents maintainable.

### PLAN File

Tracks complex tasks across sessions. Leave and return anytime with `/continue-plan`.

---

## Manual Installation (Basic)

> **Note**: This only copies the base template files. You'll need to customize agents manually. For automatic customization, use the [Quick Install](#quick-install-recommended) method above.

```bash
# Clone and copy
git clone https://github.com/LyricalString/claude-orchestrator-template.git /tmp/orc-template
cp -r /tmp/orc-template/.claude ./
cp -r /tmp/orc-template/mcp-orchestrator ./
cp /tmp/orc-template/AGENTS.md ./

# Install MCP server dependencies
cd mcp-orchestrator && bun install && cd ..

# Clean up
rm -rf /tmp/orc-template

# Add MCP server to your settings (see MCP Configuration below)
```

Or use the install script:

```bash
curl -sSL https://raw.githubusercontent.com/LyricalString/claude-orchestrator-template/main/install.sh | bash
```

### MCP Configuration

Add to your `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "orchestrator": {
      "command": "bun",
      "args": ["run", "/path/to/your/project/mcp-orchestrator/index.ts"],
      "env": {
        "PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

### Customize for Your Project

```bash
# Generate agents for your apps (inside Claude Code)
/generate-agent apps/your-app

# Update orchestrator routing table
# Edit .claude/agents/orchestrator.md

# Delete example agents you don't need
rm .claude/agents/api.md       # if not needed
rm .claude/agents/frontend.md  # if not needed
rm .claude/agents/database.md  # if no database
```

---

## After Installation

```bash
# Restart Claude Code
claude
```

Then send:

```
/investigate "overview of this project"
```

---

## Project Structure

```
your-project/
├── .claude/
│   ├── agents/           # Agent definitions
│   │   ├── orchestrator.md
│   │   ├── frontend.md
│   │   ├── api.md
│   │   └── database.md
│   ├── commands/         # Slash commands
│   │   ├── client-feedback.md
│   │   ├── investigate.md
│   │   ├── implement.md
│   │   └── ...
│   ├── plans/            # PLAN files for tracking work
│   └── logs/             # Agent execution logs
├── mcp-orchestrator/     # MCP server
│   ├── index.ts
│   └── package.json
└── AGENTS.md             # Project-wide coding conventions
```

---

## License

MIT

## Credits

Created by [Alex Martinez](https://github.com/LyricalString)
