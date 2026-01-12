# Claude Orchestrator Dashboard - Technical Specification

## Overview

A centralized web dashboard to monitor Claude Code orchestrator agents across multiple projects. Provides real-time visibility into agent execution when Claude only shows "Getting Status... Block: true".

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Machine                              │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Project A   │  │  Project B   │  │  Project C   │          │
│  │  (Claude)    │  │  (Claude)    │  │  (Claude)    │          │
│  │      │       │  │      │       │  │      │       │          │
│  │  MCP Server  │  │  MCP Server  │  │  MCP Server  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └────────────────┬┴─────────────────┘                   │
│                          │                                      │
│                          ▼                                      │
│         ┌─────────────────────────────────┐                    │
│         │   ~/.claude-dashboard/          │                    │
│         │   ├── orchestrator.db (SQLite)  │◄─── Single DB      │
│         │   ├── logs/                     │     for all        │
│         │   └── server/                   │     projects       │
│         └─────────────────────────────────┘                    │
│                          │                                      │
│                          ▼                                      │
│         ┌─────────────────────────────────┐                    │
│         │   Dashboard Web Server          │                    │
│         │   (Hono + React)                │                    │
│         │   http://localhost:4000         │                    │
│         └─────────────────────────────────┘                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Core Decisions (User Interview)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Persistence | bun:sqlite | Native to Bun, fast, zero-dependency |
| Real-time updates | Polling (1-2s) | Simple, no WebSocket complexity |
| Architecture | Separate server + shared SQLite | Clean separation, MCPs write, dashboard reads |
| Frontend | React + Vite | Familiar ecosystem, good tooling |
| UI Style | Terminal-like, dark only | Consistent with CLI workflow |
| Log streaming | Chokidar file watching | Robust cross-platform file watching |
| Log parsing | Plain text | No transformation, raw output |
| Interaction | Read-only monitoring | No agent control from web UI |
| Project identification | Directory basename | Automatic, no config needed |
| Installation | Global (~/.claude-dashboard) | Single installation serves all projects |
| MCP-Dashboard comm | Shared SQLite | No networking, DB is sync point |
| Resilience | Graceful degradation | MCP works without dashboard |
| Dashboard startup | Auto-launch by first MCP | Self-managing, no manual start |
| Data retention | 7 days auto-cleanup | Keep DB small |
| Port | 4000 | Avoid conflicts with common dev ports |

## Components

### 1. Central Dashboard Server

**Location**: `~/.claude-dashboard/`

**Structure**:
```
~/.claude-dashboard/
├── server/
│   ├── index.ts          # Hono server entry
│   ├── api/              # REST endpoints
│   ├── db.ts             # SQLite connection & queries
│   └── package.json
├── web/
│   ├── src/
│   │   ├── App.tsx       # Main React app
│   │   ├── components/
│   │   │   ├── Sidebar.tsx      # Project list
│   │   │   ├── AgentList.tsx    # Agent timeline
│   │   │   ├── LogViewer.tsx    # Streaming log view
│   │   │   └── AgentRow.tsx     # Single agent display
│   │   └── hooks/
│   │       └── usePolling.ts    # Polling logic
│   ├── index.html
│   └── package.json
├── orchestrator.db       # Shared SQLite database
├── logs/                 # Centralized log storage
│   └── {project}/{agent}_{timestamp}_{taskId}.log
└── dashboard.pid         # PID file for process management
```

**Tech Stack**:
- Runtime: Bun
- HTTP Server: Hono
- Database: bun:sqlite
- Frontend: React 18 + Vite
- File watching: Chokidar
- Styling: CSS-in-JS minimal (or plain CSS with CSS variables)

### 2. Modified MCP Server

**Changes to `mcp-orchestrator/index.ts`**:

1. **Import shared DB module**:
   - Connect to `~/.claude-dashboard/orchestrator.db`
   - Use `bun:sqlite` with WAL mode for concurrent access

2. **Write events on agent lifecycle**:
   - `spawn_agent`: INSERT new agent record
   - Process exit: UPDATE status, exit_code, completed_at
   - Log writes: Continue writing to centralized log location

3. **Auto-launch dashboard**:
   - On MCP startup, check if dashboard running (read PID file, verify process)
   - If not running, spawn dashboard server as detached process
   - Non-blocking, fire-and-forget

4. **Project identification**:
   - Use `path.basename(PROJECT_ROOT)` as project name
   - Store in DB with each agent record

5. **Graceful degradation**:
   - Wrap all DB writes in try/catch
   - Log warning if DB unavailable but continue operation
   - MCP functionality unaffected if dashboard/DB fails

### 3. Database Schema

```sql
-- Projects table (auto-populated)
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,           -- Directory basename
  path TEXT NOT NULL,                  -- Full PROJECT_ROOT path
  first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agents table
CREATE TABLE agents (
  id TEXT PRIMARY KEY,                 -- Task ID (UUID slice)
  project_id INTEGER NOT NULL,
  agent_name TEXT NOT NULL,            -- e.g., 'frontend', 'api'
  task TEXT NOT NULL,                  -- Full task/prompt
  mode TEXT NOT NULL,                  -- 'investigate' | 'implement'
  status TEXT NOT NULL DEFAULT 'running', -- 'running' | 'completed' | 'failed'
  pid INTEGER,                         -- Process ID
  log_file TEXT NOT NULL,              -- Path to log file
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  exit_code INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Index for common queries
CREATE INDEX idx_agents_project ON agents(project_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_started ON agents(started_at DESC);

-- Cleanup trigger (7 days retention)
-- Run via scheduled job or on startup
```

### 4. API Endpoints (Hono Server)

```typescript
// GET /api/projects
// Returns all projects with last activity
[
  { id: 1, name: "my-app", path: "/Users/.../my-app", lastActivity: "2026-01-12T10:30:00Z", activeAgents: 2 }
]

// GET /api/agents?project_id=1&status=running
// Returns agents, optionally filtered
[
  {
    id: "a1b2c3d4",
    projectId: 1,
    projectName: "my-app",
    agentName: "frontend",
    task: "Investigate authentication patterns...",
    mode: "investigate",
    status: "running",
    startedAt: "2026-01-12T10:30:00Z",
    completedAt: null,
    exitCode: null,
    duration: 45000  // ms, calculated
  }
]

// GET /api/agents/:id/log?offset=0
// Returns log content with optional offset for streaming
{
  content: "--- Agent: frontend ...",
  size: 4096,
  offset: 0
}

// GET /api/stats
// Optional: basic counts for header
{ running: 3, completed: 15, failed: 1 }
```

### 5. Frontend Design

**Layout**:
```
┌─────────────────────────────────────────────────────────────────┐
│  Claude Orchestrator Dashboard            http://localhost:4000  │
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                   │
│  PROJECTS    │  AGENTS                              [All] [▼]   │
│              │                                                   │
│  ● my-app    │  ┌─────────────────────────────────────────────┐ │
│    2 running │  │ ● frontend  investigate  running   0:45     │ │
│              │  │   "Investigate auth patterns in..."         │ │
│  ○ other-app │  └─────────────────────────────────────────────┘ │
│    idle      │  ┌─────────────────────────────────────────────┐ │
│              │  │ ✓ api       implement    completed  2:30  0 │ │
│              │  │   "Fix the validation bug..."               │ │
│              │  └─────────────────────────────────────────────┘ │
│              │  ┌─────────────────────────────────────────────┐ │
│              │  │ ✗ database  implement    failed     0:12  1 │ │
│              │  │   "Update migration..."                     │ │
│              │  └─────────────────────────────────────────────┘ │
│              │                                                   │
├──────────────┴──────────────────────────────────────────────────┤
│  LOG VIEWER (click agent to view)                      [×]      │
│  ─────────────────────────────────────────────────────────────  │
│  ---                                                             │
│  Agent: frontend                                                 │
│  Task ID: a1b2c3d4                                              │
│  Mode: investigate                                               │
│  Task: Investigate authentication patterns...                    │
│  Started: 2026-01-12T10:30:00Z                                  │
│  ---                                                             │
│                                                                  │
│  Searching for auth-related files...                            │
│  Found 12 files matching pattern...                             │
│  Reading src/auth/middleware.ts...                              │
│  █                                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Visual Style**:
- Background: `#0d1117` (GitHub dark)
- Text: `#c9d1d9`
- Accent (running): `#58a6ff`
- Success: `#3fb950`
- Error: `#f85149`
- Font: `"JetBrains Mono", "Fira Code", monospace`
- Border radius: 0 (sharp terminal aesthetic)
- Padding: 8px base unit

**Status Indicators**:
- `●` Running (blue, pulsing animation)
- `✓` Completed (green)
- `✗` Failed (red)
- `○` Idle project (gray)

**Agent Row Info**:
- Status icon
- Agent name
- Mode badge (investigate/implement)
- Status text
- Duration (MM:SS while running, final when done)
- Exit code (if completed/failed)
- Task preview (truncated to ~50 chars)

### 6. Real-time Updates

**Polling Strategy**:
```typescript
// usePolling.ts
const POLL_INTERVAL = 2000; // 2 seconds

function useAgentPolling(projectId?: number) {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    const poll = async () => {
      const res = await fetch(`/api/agents?project_id=${projectId || ''}`);
      const data = await res.json();
      setAgents(data);
    };

    poll(); // Initial fetch
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [projectId]);

  return agents;
}
```

**Log Streaming**:
- Chokidar watches `~/.claude-dashboard/logs/`
- On file change, server tracks file size
- Client polls `/api/agents/:id/log?offset=N`
- Append new content to log viewer
- Auto-scroll to bottom

### 7. Installation & Setup

**Dashboard Installation** (one-time):
```bash
# Clone dashboard to global location
git clone https://github.com/user/claude-dashboard ~/.claude-dashboard
cd ~/.claude-dashboard
bun install
```

**MCP Server Configuration** (per project):
```json
// .mcp.json in each project
{
  "mcpServers": {
    "orchestrator": {
      "command": "bun",
      "args": ["run", "mcp-orchestrator/index.ts"],
      "env": {
        "PROJECT_ROOT": ".",
        "DASHBOARD_DB": "~/.claude-dashboard/orchestrator.db",
        "DASHBOARD_LOGS": "~/.claude-dashboard/logs"
      }
    }
  }
}
```

**Auto-start Logic** (in MCP server):
```typescript
async function ensureDashboardRunning() {
  const pidFile = path.join(DASHBOARD_PATH, 'dashboard.pid');

  try {
    if (existsSync(pidFile)) {
      const pid = parseInt(readFileSync(pidFile, 'utf-8'));
      // Check if process exists
      process.kill(pid, 0);
      return; // Dashboard running
    }
  } catch {
    // PID invalid or process dead
  }

  // Launch dashboard
  const dashboard = spawn('bun', ['run', 'server/index.ts'], {
    cwd: DASHBOARD_PATH,
    detached: true,
    stdio: 'ignore'
  });
  dashboard.unref();

  writeFileSync(pidFile, String(dashboard.pid));
}
```

### 8. Data Cleanup

**7-day Retention**:
```typescript
// Run on dashboard startup
function cleanupOldData() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  db.run(`
    DELETE FROM agents
    WHERE started_at < ? AND status != 'running'
  `, [cutoff.toISOString()]);

  // Also clean up orphaned log files
  // ...
}
```

## MVP Scope

### Phase 1 - Core (MVP)
1. SQLite schema and shared DB setup
2. Modify MCP server to write to shared DB
3. Basic Hono API server with CRUD endpoints
4. React app with project sidebar + agent list
5. Real-time polling (2s interval)
6. Basic log viewer (no streaming yet)
7. Auto-launch dashboard from MCP
8. Dark terminal theme

### Phase 2 - Polish
1. Log streaming with Chokidar
2. Auto-cleanup (7 days)
3. Better error handling
4. Loading states
5. Empty states

### Phase 3 - Nice to Have
1. Filter by status
2. Search agents/tasks
3. Keyboard shortcuts
4. Export logs
5. Desktop notifications

## File Changes Required

### New Files
```
~/.claude-dashboard/
├── server/
│   ├── index.ts
│   ├── db.ts
│   ├── routes/agents.ts
│   ├── routes/projects.ts
│   └── package.json
├── web/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/...
│   │   └── styles.css
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
└── install.sh
```

### Modified Files
```
mcp-orchestrator/index.ts
├── Add: import db module
├── Add: ensureDashboardRunning()
├── Modify: spawn_agent to INSERT to DB
├── Modify: status checking to UPDATE DB
└── Add: graceful degradation try/catch

mcp-orchestrator/package.json
└── Add: chokidar dependency (if needed)
```

## Development Commands

```bash
# Install dashboard globally
~/.claude-dashboard/install.sh

# Start dashboard manually (for development)
cd ~/.claude-dashboard && bun run dev

# View dashboard
open http://localhost:4000

# Check if dashboard running
cat ~/.claude-dashboard/dashboard.pid && ps aux | grep "dashboard"
```

## Security Considerations

1. **Local only**: Dashboard binds to `127.0.0.1:4000`, not exposed externally
2. **No auth needed**: It's your local machine, no sensitive data exposed
3. **Read-only web UI**: Cannot spawn/kill agents from browser
4. **SQLite permissions**: File inherits user permissions

## Performance Considerations

1. **SQLite WAL mode**: Concurrent reads don't block writes
2. **Polling not WS**: Simpler, 2s latency acceptable for monitoring
3. **Log file streaming**: Only read new bytes, not entire file
4. **7-day cleanup**: Prevents unbounded DB growth
5. **Index on common queries**: project_id, status, started_at
