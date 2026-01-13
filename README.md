# Claude Code Orchestrator Template

A powerful multi-agent orchestration system for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Handle complex tasks with parallel agent coordination, persistent PLAN file tracking, and app-specific specialists using an MCP server.

---

## Installation

The orchestrator has two parts:
1. **Global installation** - MCP server + Dashboard (one per machine)
2. **Project setup** - Custom agents + commands (one per project)

### Step 1: Global Installation (Once)

Install the MCP server and Dashboard globally:

```bash
curl -sSL https://raw.githubusercontent.com/LyricalString/claude-orchestrator-template/main/install-global.sh | bash
```

This installs to `~/.claude-orchestrator/`:
- `mcp-orchestrator/` - MCP server
- `dashboard/` - Web dashboard
- `bin/update.sh` - Update script

### Step 2: Project Setup (Per Project)

> **Requires**: [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed (`npm install -g @anthropic-ai/claude-code`)

Open Claude Code in your project:

```bash
cd your-project
claude
```

Then paste this message:

```
Fetch https://raw.githubusercontent.com/LyricalString/claude-orchestrator-template/main/SETUP_PROMPT.md and follow those instructions to set up the orchestrator in my project
```

Claude will:
1. Ask what you want to customize (or continue with defaults)
2. Verify the global installation exists
3. Copy commands to `.claude/commands/`
4. Analyze your project with parallel agents
5. Generate custom agents for your codebase
6. Create/merge `AGENTS.md`
7. Configure MCP to use the global installation

---

## Updating

The dashboard will notify you when updates are available with a banner showing the update command.

### Quick Update (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/LyricalString/claude-orchestrator-template/main/update.sh | bash
```

### Or use the local script

```bash
~/.claude-orchestrator/bin/update.sh
```

Both methods update the global installation (MCP server + dashboard) without touching your project-specific agents or config.

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

## Dashboard

The dashboard provides real-time visibility into agent activity across all projects:

- **Real-time updates** via Server-Sent Events (SSE)
- **Log streaming** as agents work
- **Token tracking** for usage monitoring
- **Multi-project view** - see agents from all projects

Start the dashboard:

```bash
cd ~/.claude-orchestrator/dashboard && bun run start
```

Or it auto-starts when you use the orchestrator.

Open: http://localhost:4000

---

## MCP Orchestrator

The orchestrator uses an MCP server that provides these tools:

| Tool | Purpose |
| ---- | ------- |
| `mcp__orchestrator__spawn_agent` | Launch a subagent with a specific task |
| `mcp__orchestrator__get_agent_status` | Check status and read output. **Use `block=true` to wait for completion** |
| `mcp__orchestrator__list_agents` | List all available and spawned agents |
| `mcp__orchestrator__kill_agent` | Terminate a running agent |
| `mcp__orchestrator__read_agent_log` | Read agent logs with optional `offset`, `limit`, `tail` params |
| `mcp__orchestrator__search_agent_logs` | Search logs with regex pattern and optional context lines |

### Waiting for Agents to Complete

Use `get_agent_status` with `block=true` to wait synchronously for an agent to finish:

```typescript
// Non-blocking (default): returns immediately with current status
mcp__orchestrator__get_agent_status({ taskId: "abc123" })

// Blocking: waits until agent completes or timeout
mcp__orchestrator__get_agent_status({ taskId: "abc123", block: true })

// Blocking with custom timeout (10 minutes)
mcp__orchestrator__get_agent_status({ taskId: "abc123", block: true, timeout: 600000 })
```

**Parameters:**
- `taskId` (required): The task ID returned by `spawn_agent`
- `block` (optional, default: `false`): If `true`, wait for agent to complete
- `timeout` (optional, default: `300000`): Max wait time in ms when blocking (5 min default)

**Response includes:**
- `timedOut`: `true` if the timeout was reached before completion

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

## Project Structure

After setup, your project will have:

```
your-project/
├── .claude/
│   ├── agents/           # Agent definitions (customized for YOUR project)
│   │   ├── orchestrator.md
│   │   └── [your-apps].md
│   ├── commands/         # Slash commands
│   │   ├── client-feedback.md
│   │   ├── investigate.md
│   │   └── ...
│   ├── plans/            # PLAN files for tracking work
│   └── logs/             # Local agent logs
├── AGENTS.md             # Project-wide coding conventions
└── .mcp.json             # MCP server config (points to global install)
```

Global installation:

```
~/.claude-orchestrator/
├── mcp-orchestrator/     # MCP server (shared)
├── dashboard/            # Web dashboard (shared)
├── bin/update.sh         # Update script
├── orchestrator.db       # SQLite database (all projects)
└── logs/                 # Agent logs (organized by project)
```

---

## Manual Setup

If you prefer manual setup:

### 1. Install globally

```bash
git clone https://github.com/LyricalString/claude-orchestrator-template.git /tmp/orc
bash /tmp/orc/install-global.sh
rm -rf /tmp/orc
```

### 2. Copy to project

```bash
cd your-project

# Clone template
git clone --depth 1 https://github.com/LyricalString/claude-orchestrator-template.git /tmp/orc-template

# Copy commands and template agents
mkdir -p .claude/agents .claude/commands .claude/plans .claude/logs
cp -r /tmp/orc-template/.claude/commands/* .claude/commands/
cp -r /tmp/orc-template/.claude/agents/* .claude/agents/
cp /tmp/orc-template/AGENTS.md ./

# Clean up
rm -rf /tmp/orc-template
```

### 3. Configure MCP

Create `.mcp.json`:

```json
{
  "mcpServers": {
    "orchestrator": {
      "command": "bun",
      "args": ["run", "~/.claude-orchestrator/mcp-orchestrator/index.ts"],
      "env": {
        "PROJECT_ROOT": "."
      }
    }
  }
}
```

### 4. Customize agents

```bash
# Inside Claude Code
/generate-agent apps/your-app

# Or manually edit .claude/agents/
```

---

## License

MIT

## Credits

Created by [Alex Martinez](https://github.com/LyricalString)
