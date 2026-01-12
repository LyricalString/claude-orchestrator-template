# Claude Code Orchestrator - Setup Instructions

You are setting up the Claude Code Orchestrator system in the user's current project. Follow these steps carefully and in order.

**IMPORTANT: Context Management**

- For analysis-heavy tasks, use the Task tool to launch async agents
- This keeps the main context clean and allows parallel investigation
- Only bring back summaries, not raw findings

---

## Phase 0: User Preferences

Before starting, explain what you're going to do and ask for user preferences.

### Step 0.1: Explain the Setup Process

Tell the user:

```
## Claude Code Orchestrator Setup

I'm going to set up the orchestrator system in your project. Here's what I'll do:

### Steps:
1. **Pre-flight** - Check git status, verify global installation
2. **Copy commands** - Generic slash commands to .claude/commands/
3. **Analyze project** - Use parallel agents to understand your codebase
4. **Generate agents** - Create custom agents tailored to your code
5. **AGENTS.md** - Create or merge coding guidelines
6. **Configure MCP** - Point to global installation

### What gets created in your project:
```
.claude/
├── agents/        ← Custom agents for YOUR project
├── commands/      ← Slash commands (generic)
├── plans/         ← PLAN files directory
└── logs/          ← Local logs directory
AGENTS.md          ← Project coding guidelines
.claude/settings.json or .mcp.json ← MCP config
```

### What I WON'T touch:
- Your existing code
- Global installation (~/.claude-orchestrator/)
- Other config files

---

**Options:**
1. **Continue with all steps** (recommended)
2. **Customize** - Choose which steps to run
3. **More details** - Explain each step in depth
4. **Cancel** - Stop setup

Which option? (1/2/3/4)
```

**Wait for user response.**

### Step 0.2: Handle User Choice

- **Option 1 (Continue):** Proceed to Phase 1
- **Option 2 (Customize):** Show checklist:
  ```
  Which steps do you want to run?

  [x] Pre-flight checks
  [x] Copy commands to .claude/commands/
  [x] Analyze project structure
  [x] Generate custom agents
  [x] Create/merge AGENTS.md
  [x] Configure MCP server

  Reply with the numbers you want to SKIP (e.g., "skip 3,4" or "only 1,2,6")
  ```
  Then proceed with selected steps only.
- **Option 3 (More details):** Explain each phase in detail, then ask again
- **Option 4 (Cancel):** Stop

---

## Phase 1: Pre-flight Checks

### Step 1.1: Verify Global Installation

Check if the global installation exists:

```bash
ls ~/.claude-orchestrator/mcp-orchestrator/index.ts 2>/dev/null && echo "GLOBAL_OK" || echo "GLOBAL_MISSING"
```

**If GLOBAL_MISSING:**

Tell the user:

```
## Global Installation Required

The MCP server and Dashboard need to be installed globally first.

Run this command in your terminal:

```bash
curl -sSL https://raw.githubusercontent.com/LyricalString/claude-orchestrator-template/main/install-global.sh | bash
```

Or manually:
```bash
git clone https://github.com/LyricalString/claude-orchestrator-template.git /tmp/orc
bash /tmp/orc/install-global.sh
rm -rf /tmp/orc
```

After installation completes, come back and run this setup again.
```

**Stop here if global installation is missing.**

### Step 1.2: Verify Git Status

Run:

```bash
git status --porcelain
```

**If there are uncommitted changes (output is not empty):**

Tell the user:

```
You have uncommitted changes:

[list the changed files]

I recommend stashing these before proceeding. Options:
1. Stash changes (recommended) - I'll remind you to unstash after
2. Continue anyway
3. Stop - you handle it manually

Which option? (1/2/3)
```

- If 1: Run `git stash push -m "Pre-orchestrator-setup"` and remember `STASH_CREATED=true`
- If 2: Continue with `STASH_CREATED=false`
- If 3: Stop and wait for user

**If clean:** Continue with `STASH_CREATED=false`

---

## Phase 2: Copy Template Files

### Step 2.1: Clone and Copy Commands Only

Run these commands:

```bash
git clone --depth 1 https://github.com/LyricalString/claude-orchestrator-template.git /tmp/orc-template

# Create directories
mkdir -p .claude/agents .claude/commands .claude/plans .claude/logs

# Copy commands (generic, work for any project)
cp -r /tmp/orc-template/.claude/commands/* .claude/commands/

# Copy template agents (will be replaced with custom ones)
cp -r /tmp/orc-template/.claude/agents/* .claude/agents/

# Clean up
rm -rf /tmp/orc-template
```

**Note:** We do NOT copy mcp-orchestrator/ or dashboard/ - those are in the global installation.

### Step 2.2: Verify Copy

```bash
ls .claude/agents/ .claude/commands/
```

Confirm files exist before proceeding.

---

## Phase 2.5: Read Existing Documentation

**USE ASYNC AGENT** - Launch a Task agent to read documentation without bloating main context.

```
Task: Documentation Discovery Agent

Read and summarize the project's existing documentation. Check for:
- README.md - Project overview
- CONTRIBUTING.md - Contribution guidelines
- AGENTS.md - Existing agent instructions (IMPORTANT)
- docs/ or documentation/ directory
- ARCHITECTURE.md, ADR/, DESIGN.md
- Any .md files in root that look relevant

Return a structured summary:
{
  "files_found": ["list of doc files"],
  "project_description": "1-2 sentences",
  "key_conventions": ["bullet points"],
  "existing_agents_md": true/false,
  "existing_agents_md_sections": ["list section headers if exists"],
  "architecture_notes": ["important patterns or systems mentioned"]
}

Keep the summary concise - we'll use it to inform agent generation.
```

### Step 2.5.2: Present Documentation Findings

After the agent returns, tell the user:

```
## Existing Documentation Found

| File | Summary |
|------|---------|
[list each doc found with 1-line summary]

### Key Insights:
[bullet points from agent's findings]

### Existing AGENTS.md: [Yes/No]
[If yes: "I found existing coding guidelines. I'll propose merging with orchestrator additions later."]

Does this capture the important context? Anything I should know that isn't documented?
```

**Wait for user input** - they may add context not in docs.

---

## Phase 3: Analyze Project Structure

**USE ASYNC AGENTS** - Launch parallel Task agents for analysis.

Tell the user:

```
Analyzing your project structure with parallel agents...
```

### Step 3.1: Launch Parallel Analysis Agents

Launch these agents IN PARALLEL using multiple Task calls in a single message:

**Task 1 - Project Type & Stack Agent:**

```
Analyze the project root to determine:

1. Project Type: Check for monorepo indicators (turbo.json, nx.json, lerna.json, pnpm-workspace.yaml, package.json "workspaces", Cargo.toml workspace, go.work)

2. Language & Framework: Primary language(s) and framework(s)

3. Package Manager: Detect from lockfiles (bun.lockb, pnpm-lock.yaml, yarn.lock, package-lock.json, poetry.lock, Cargo.lock, go.sum)

4. Key Scripts: Read build/test/lint/dev commands from package.json, Makefile, pyproject.toml, etc.

Return JSON:
{
  "is_monorepo": boolean,
  "monorepo_tool": "turbo|nx|lerna|pnpm|cargo|go|null",
  "languages": ["typescript", "python", etc],
  "frameworks": ["nextjs", "express", etc],
  "package_manager": "bun|pnpm|npm|yarn|poetry|cargo|go",
  "scripts": { "build": "...", "test": "...", "lint": "...", "dev": "..." }
}
```

**Task 2 - Apps & Packages Discovery Agent:**

```
Find all apps and packages in this project.

Scan: apps/, packages/, services/, src/, lib/, cmd/, internal/

For each directory with a manifest file (package.json, Cargo.toml, pyproject.toml, go.mod), extract:
- path: relative path
- name: from manifest
- framework: infer from dependencies
- purpose: from description or infer from name/structure

Return JSON array:
[{ "path": "...", "name": "...", "framework": "...", "purpose": "..." }]
```

**Task 3 - Database & Services Agent:**

```
Detect database and external service integrations.

Database: Check for supabase/, prisma/, drizzle/, sqlalchemy, diesel, gorm
External: Look for Stripe, S3/R2, SendGrid/Resend, auth providers, LLM APIs

IMPORTANT: Report integration TYPES, not specific configuration.
- Good: "LLM for PDF extraction", "IMAP for email"
- Bad: "google/gemini-2.0-flash-001", "imap.gmail.com:993"

Return JSON:
{
  "database": { "type": "postgres|mysql|sqlite|mongo|null", "orm": "prisma|drizzle|sqlalchemy|null", "migrations_path": "..." },
  "auth": "clerk|next-auth|auth0|better-auth|passport|null",
  "services": ["stripe", "s3", "resend", "llm", "imap", ...]
}
```

**Task 4 - Testing & Quality Agent:**

```
Detect testing and quality tools.

Check for: jest, vitest, pytest, cargo test, go test, playwright, cypress
Linting: eslint, biome, ruff, clippy, golangci-lint
CI/CD: .github/workflows/, .gitlab-ci.yml, vercel.json

Return JSON:
{
  "test_framework": "jest|vitest|pytest|cargo|go|null",
  "linter": "eslint|biome|ruff|clippy|null",
  "ci_cd": "github-actions|gitlab|vercel|null"
}
```

### Step 3.2: Synthesize Findings

After all agents return, combine their findings and determine agent strategy:

**For Monorepos:** Use app-based agents (one per app/package)

**For Single-App Projects:** Use domain-based agents. Launch another async agent:

```
Task: Domain Analysis Agent

Scan source directories for distinct specialist domains.

Score each potential domain:
| Signal | Points |
|--------|--------|
| File count > 10 | +2 |
| Has own tests | +2 |
| Uses 3+ external packages | +2 |
| Has own types/models | +1 |
| Complex business logic | +1 |
| Integrates external service | +2 |
| Has own README | +2 |
| Referenced from 5+ files | +1 |

Return domains with score >= 4 as candidates for dedicated agents.

JSON: [{ "name": "...", "path": "...", "score": N, "purpose": "..." }]
```

### Step 3.3: Present Analysis to User

```
## Project Analysis Complete

### Project Overview
- **Type**: [Monorepo / Single-App]
- **Language**: [Primary language(s)]
- **Framework**: [Main framework(s)]
- **Package Manager**: [detected]
- **Database**: [type + ORM]

### [If Monorepo] Apps Detected:
| App | Path | Framework | Purpose |
|-----|------|-----------|---------|
[list each]

### [If Single-App] Domains for Dedicated Agents:
| Domain | Path | Score | Purpose |
|--------|------|-------|---------|
[domains with score >= 4]

### Proposed Agent Structure:
| Agent | Scope | Purpose |
|-------|-------|---------|
[list proposed agents]

---

Does this look correct? Any adjustments needed?
```

**Wait for user confirmation before proceeding.**

---

## Phase 4: Handle AGENTS.md

### If Existing AGENTS.md Found:

Read both files and propose a merge:

```
## AGENTS.md Merge Proposal

### Keep from your existing file:
- [List sections to preserve]

### Add from orchestrator template:
- Orchestrator Workflow section
- Agent Maintenance section

### Update:
- Commands → Your actual commands

Does this merge approach work? (yes / suggest changes)
```

**Wait for confirmation.**

### If No Existing AGENTS.md:

Copy from template and customize:

```bash
curl -sSL https://raw.githubusercontent.com/LyricalString/claude-orchestrator-template/main/AGENTS.md -o AGENTS.md
```

Then customize based on detected patterns.

---

## Phase 5: Generate Agents

### Step 5.1: Update Orchestrator

Edit `.claude/agents/orchestrator.md`:

- Update routing table with actual agents
- Update detection keywords
- Update bash permissions for detected package manager

### Step 5.2: Generate Each Agent

**USE ASYNC AGENTS** - For each agent to create, launch a Task agent:

```
Task: Generate [App Name] Agent

Create agent definition for [path].

Scan the directory and extract:
- Libraries/packages used (names from manifest, NOT pinned versions)
- Directory structure and file organization
- Coding patterns and conventions
- Available commands from scripts

**What to Include vs. Exclude:**

| Include (helps route tasks)              | Exclude (look up during implementation)           |
|------------------------------------------|---------------------------------------------------|
| Libraries/packages used                  | Specific versions (they change frequently)        |
| Directory structure                      | Function/class names (searchable when needed)     |
| Coding patterns & conventions            | Config values (model names, API endpoints, env vars) |
| Integration types ("uses LLM", "IMAP")   | Runtime configuration details                     |
| File organization                        | Schema field names or DB column names             |

IMPORTANT: Do NOT infer or guess specific values. If you don't find something in the code, don't include it. Never write plausible-sounding specifics that you haven't verified.

Write to: .claude/agents/[name].md

Return: Confirmation that file was written with key details included.
```

Launch these in parallel for independent apps.

### Step 5.3: Clean Up

Delete unused template agents:

```bash
rm .claude/agents/api.md       # if not needed
rm .claude/agents/frontend.md  # if not needed
rm .claude/agents/database.md  # if no database
```

### Step 5.4: Write AGENTS.md

Write the confirmed AGENTS.md (merged or new).

### Step 5.5: Configure MCP Server

The MCP server is installed globally at `~/.claude-orchestrator/`. Configure it to work with this project.

**Detect config location:**

```bash
# Check for existing .mcp.json (Claude Code's preferred location)
if [ -f ".mcp.json" ]; then
    echo "MCP_CONFIG=.mcp.json"
elif [ -f ".claude/settings.json" ]; then
    echo "MCP_CONFIG=.claude/settings.json"
else
    echo "MCP_CONFIG=.mcp.json"
fi
```

Tell the user:

```
## MCP Server Configuration

The orchestrator MCP server is installed globally. I need to configure this project to use it.

**Configuration file:** [.mcp.json or .claude/settings.json]

I'll add this configuration:

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

This tells Claude Code to:
- Use the global MCP server (no duplication per project)
- Set PROJECT_ROOT to the current directory (for project-specific agents)

Should I create/update this config? (yes/no)
```

**If yes:** Create or merge the config file.

**Important:** Use the tilde path `~/.claude-orchestrator/` which Bun expands correctly.

---

## Phase 6: Summary

```
## Setup Complete!

### Project: [name]
- **Type**: [Monorepo / Single-App]
- **Language**: [language]
- **Package Manager**: [pm]

### Agents Generated:
| Agent | File | Purpose |
|-------|------|---------|
[list each]

### Commands Available:
| Command | Purpose |
|---------|---------|
| `/client-feedback "..."` | Full 3-phase workflow |
| `/investigate "..."` | Read-only investigation |
| `/plan-fix` | Create implementation plan |
| `/implement` | Execute the plan |
| `/continue-plan FILE.md` | Resume from PLAN file |
| `/generate-agent path/` | Add new agent |
| `/update-agent name` | Update existing agent |

### Configuration:
- **MCP Server**: ~/.claude-orchestrator/mcp-orchestrator/
- **Dashboard**: ~/.claude-orchestrator/dashboard/
- **Project Config**: [.mcp.json or .claude/settings.json]

### Dashboard:
The dashboard shows all agents across all projects.
Start it with: `cd ~/.claude-orchestrator/dashboard && bun run start`
Or it auto-starts when you use the orchestrator.

---

### Test the Setup:

Restart Claude Code, then run:

```
/investigate "give me an overview of this project"
```

[If STASH_CREATED:]
### Don't Forget!
```bash
git stash pop
```
```

---

## Error Handling

| Error                        | Resolution                              |
| ---------------------------- | --------------------------------------- |
| Global installation missing  | Run install-global.sh first             |
| Git clone fails              | Check internet, retry                   |
| bun install fails            | Try `npm install` instead               |
| Analysis agent fails         | Report error, offer retry               |
| User disagrees with analysis | Update based on feedback                |
| File write fails             | Report error, don't leave partial state |

---

## Updating the Global Installation

To update the MCP server and dashboard (not project-specific config):

```bash
~/.claude-orchestrator/bin/update.sh
```

This updates the global installation without touching:
- Project-specific agents
- Project-specific config
- Database and logs

---

## Key Principles

1. **Ask before acting** - Phase 0 gives user control over what happens
2. **Global vs Project** - MCP server is global, agents are per-project
3. **Use async agents for heavy analysis** - Keep main context clean
4. **Documentation first** - Read existing docs before code analysis
5. **Confirm with user** - Before generating agents
6. **Parallel when possible** - Launch independent analyses together
7. **Return summaries, not raw data** - Agents should synthesize
8. **Patterns over specifics** - Agents describe conventions and structure, not implementation details that change or can be looked up. Never infer or guess specific values (model names, endpoints, versions) - only include what you verify in the code.
