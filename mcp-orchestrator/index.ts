#!/usr/bin/env bun
/**
 * MCP Orchestrator Server
 *
 * Enables Claude Code to spawn and monitor subagents using `claude -p`
 * Agents run as independent processes and write to log files.
 * Integrates with the dashboard (code in repo, data at ~/.claude-orchestrator)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { Database } from "bun:sqlite";

// Installation directory (where orchestrator is installed globally)
const INSTALL_DIR = path.join(homedir(), ".claude-orchestrator");

// Project root directory (current working directory where Claude Code is running)
const PROJECT_ROOT = process.cwd();
const PROJECT_NAME = path.basename(PROJECT_ROOT);
const AGENTS_DIR = path.join(PROJECT_ROOT, ".claude", "agents");
const LOCAL_LOGS_DIR = path.join(PROJECT_ROOT, ".claude", "logs");

// Data directory (shared across all projects using the orchestrator)
const DATA_DIR = INSTALL_DIR;
const DASHBOARD_DB_PATH = path.join(DATA_DIR, "orchestrator.db");
const DASHBOARD_LOGS_DIR = path.join(DATA_DIR, "logs", PROJECT_NAME);
const DASHBOARD_PID_FILE = path.join(DATA_DIR, "dashboard.pid");
const DASHBOARD_PORT_FILE = path.join(DATA_DIR, "dashboard.port");

// Dashboard server (in the installation directory)
const DASHBOARD_SERVER_DIR = path.join(INSTALL_DIR, "dashboard", "server");

// Use data directory for logs (shared), fallback to local
const LOGS_DIR = DASHBOARD_LOGS_DIR;

// Ensure directories exist
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
if (!fs.existsSync(LOCAL_LOGS_DIR)) fs.mkdirSync(LOCAL_LOGS_DIR, { recursive: true });

// Types
interface AgentTask {
  id: string;
  agentName: string;
  task: string;
  mode: "investigate" | "implement";
  status: "running" | "completed" | "failed";
  pid: number | null;
  logFile: string;
  startedAt: Date;
  completedAt: Date | null;
  exitCode: number | null;
}

// Global state of agents (in-memory for this session)
const runningAgents: Map<string, AgentTask> = new Map();

// Allowed tools by mode
const INVESTIGATE_TOOLS = "Read,Glob,Grep,LS,WebFetch,WebSearch";
const IMPLEMENT_TOOLS = "Read,Glob,Grep,LS,Edit,Write,Bash,WebFetch,WebSearch";

// ============ Log Parser ============

interface LogEntry {
  type: "text" | "tool_call" | "tool_result" | "result" | "error";
  content: string;
  toolName?: string;
  toolInput?: string;
  isError?: boolean;
  stats?: {
    duration_ms: number;
    total_cost_usd: number;
    input_tokens: number;
    output_tokens: number;
    num_turns: number;
  };
}

interface StreamJsonMessage {
  type: string;
  subtype?: string;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
      tool_use_id?: string;
      content?: string | Array<{ type: string; text?: string }>;
    }>;
  };
  result?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  num_turns?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  content_block?: {
    type: string;
    text?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
}

function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  const knownKeys: Record<string, string> = {
    Bash: "command", Read: "file_path", Glob: "pattern",
    Grep: "pattern", Edit: "file_path", Write: "file_path"
  };
  const key = knownKeys[toolName];
  if (key && input[key]) {
    const val = String(input[key]);
    return val.length > 100 ? val.slice(0, 100) + "..." : val;
  }
  const values = Object.values(input).filter(v => v && typeof v === "string");
  if (values.length > 0) {
    const val = String(values[0]);
    return val.length > 100 ? val.slice(0, 100) + "..." : val;
  }
  return "";
}

function parseJsonEntry(data: StreamJsonMessage, finalResultText: string | null): LogEntry | null {
  if (data.type === "system" && data.subtype === "init") return null;

  // Content block streaming format (tool_use)
  if (data.type === "content_block_start" && data.content_block) {
    const block = data.content_block;
    if (block.type === "tool_use" && block.name) {
      return {
        type: "tool_call",
        content: block.name,
        toolName: block.name,
        toolInput: block.input ? formatToolInput(block.name, block.input) : undefined,
      };
    }
  }

  // Assistant message with text or tool use
  if (data.type === "assistant" && data.message?.content) {
    for (const block of data.message.content) {
      if (block.type === "text" && block.text) {
        if (finalResultText && block.text === finalResultText) return null;
        return { type: "text", content: block.text };
      }
      if (block.type === "tool_use" && block.name) {
        return {
          type: "tool_call",
          content: block.name,
          toolName: block.name,
          toolInput: block.input ? formatToolInput(block.name, block.input) : undefined,
        };
      }
    }
  }

  // Tool result
  if (data.type === "user" && data.message?.content) {
    for (const block of data.message.content) {
      if (block.type === "tool_result" && block.content !== undefined) {
        let content: string;
        if (typeof block.content === "string") {
          content = block.content;
        } else if (Array.isArray(block.content)) {
          content = block.content
            .filter((c) => c.type === "text" && c.text)
            .map((c) => c.text)
            .join("\n");
        } else {
          content = "";
        }
        return { type: "tool_result", content, isError: false };
      }
    }
  }

  // Final result
  if (data.type === "result") {
    return {
      type: "result",
      content: data.result || "Task completed",
      stats: {
        duration_ms: data.duration_ms || 0,
        total_cost_usd: data.total_cost_usd || 0,
        input_tokens: data.usage?.input_tokens || 0,
        output_tokens: data.usage?.output_tokens || 0,
        num_turns: data.num_turns || 0,
      },
    };
  }

  return null;
}

function parseLog(rawLog: string): LogEntry[] {
  const entries: LogEntry[] = [];
  const lines = rawLog.split("\n");
  let inHeader = false;
  let finalResultText: string | null = null;

  // First pass: find final result to avoid duplicates
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") continue;
    try {
      const data = JSON.parse(trimmed) as StreamJsonMessage;
      if (data.type === "result" && data.result) {
        finalResultText = data.result;
      }
    } catch { /* ignore */ }
  }

  // Second pass: parse entries
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "---") { inHeader = !inHeader; continue; }
    if (inHeader || !trimmed) continue;

    try {
      const data = JSON.parse(trimmed) as StreamJsonMessage;
      const entry = parseJsonEntry(data, finalResultText);
      if (entry) entries.push(entry);
    } catch { /* skip non-JSON */ }
  }

  return entries;
}

// ============ Dashboard Integration ============

let db: Database | null = null;
let projectId: number | null = null;
let sessionId: string | null = null;

/**
 * Initialize dashboard database connection (graceful degradation)
 */
function initDashboardDB(): boolean {
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  try {
    db = new Database(DASHBOARD_DB_PATH);
    db.run("PRAGMA journal_mode = WAL");

    // Ensure schema exists (in case dashboard server hasn't run yet)
    db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        path TEXT NOT NULL,
        first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id INTEGER NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        status TEXT NOT NULL DEFAULT 'active',
        FOREIGN KEY (project_id) REFERENCES projects(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        project_id INTEGER NOT NULL,
        session_id TEXT,
        agent_name TEXT NOT NULL,
        task TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        pid INTEGER,
        log_file TEXT NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        exit_code INTEGER,
        FOREIGN KEY (project_id) REFERENCES projects(id),
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `);

    // Migration for existing DBs
    try {
      db.run(`ALTER TABLE agents ADD COLUMN session_id TEXT`);
    } catch {
      // Column already exists
    }

    db.run(`CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_agents_started ON agents(started_at DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(session_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)`);

    // Get or create project
    const existing = db.query<{ id: number }, [string]>(
      "SELECT id FROM projects WHERE name = ?"
    ).get(PROJECT_NAME);

    if (existing) {
      projectId = existing.id;
      db.run(
        "UPDATE projects SET last_activity_at = CURRENT_TIMESTAMP, path = ? WHERE id = ?",
        [PROJECT_ROOT, existing.id]
      );
    } else {
      const result = db.run(
        "INSERT INTO projects (name, path) VALUES (?, ?)",
        [PROJECT_NAME, PROJECT_ROOT]
      );
      projectId = Number(result.lastInsertRowid);
    }

    // Create a new session for this orchestrator instance
    sessionId = randomUUID().slice(0, 8);
    db.run(
      "INSERT INTO sessions (id, project_id, status) VALUES (?, ?, 'active')",
      [sessionId, projectId]
    );

    console.error(`[Dashboard] Connected to dashboard DB, project: ${PROJECT_NAME} (id: ${projectId}), session: ${sessionId}`);
    return true;
  } catch (err) {
    console.error("[Dashboard] Failed to connect to dashboard DB:", err);
    db = null;
    return false;
  }
}

/**
 * Write agent to dashboard database
 */
function dbInsertAgent(agent: AgentTask): void {
  if (!db || !projectId) return;

  try {
    db.run(`
      INSERT INTO agents (id, project_id, session_id, agent_name, task, mode, pid, log_file, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running')
    `, [agent.id, projectId, sessionId, agent.agentName, agent.task, agent.mode, agent.pid, agent.logFile]);

    db.run("UPDATE projects SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?", [projectId]);
  } catch (err) {
    console.error("[Dashboard] Failed to insert agent:", err);
  }
}

/**
 * End the current session
 */
function dbEndSession(): void {
  if (!db || !sessionId) return;

  try {
    db.run(`
      UPDATE sessions
      SET status = 'ended', ended_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [sessionId]);
  } catch (err) {
    console.error("[Dashboard] Failed to end session:", err);
  }
}

/**
 * Update agent status in dashboard database
 */
function dbUpdateAgentStatus(id: string, status: string, exitCode: number | null): void {
  if (!db) return;

  try {
    db.run(`
      UPDATE agents
      SET status = ?, exit_code = ?, completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, exitCode, id]);
  } catch (err) {
    console.error("[Dashboard] Failed to update agent status:", err);
  }
}

/**
 * Update agent token usage in dashboard database
 */
function dbUpdateAgentTokens(taskId: string, inputTokens: number, outputTokens: number): void {
  if (!db) return;

  try {
    db.run(`
      UPDATE agents SET input_tokens = ?, output_tokens = ? WHERE id = ?
    `, [inputTokens, outputTokens, taskId]);
  } catch (err) {
    console.error("[Dashboard] Failed to update agent tokens:", err);
  }
}

/**
 * Check if dashboard server is running
 */
function isDashboardRunning(): boolean {
  if (!fs.existsSync(DASHBOARD_PID_FILE)) return false;

  try {
    const pid = parseInt(fs.readFileSync(DASHBOARD_PID_FILE, "utf-8").trim());
    process.kill(pid, 0); // Check if process exists
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the dashboard port from the port file
 */
function getDashboardPort(): number | null {
  if (!fs.existsSync(DASHBOARD_PORT_FILE)) return null;
  try {
    return parseInt(fs.readFileSync(DASHBOARD_PORT_FILE, "utf-8").trim());
  } catch {
    return null;
  }
}

/**
 * Start the dashboard server if not running
 */
function ensureDashboardRunning(): void {
  if (!fs.existsSync(DASHBOARD_SERVER_DIR)) {
    console.error("[Dashboard] Dashboard server not found at", DASHBOARD_SERVER_DIR);
    console.error("[Dashboard] Run 'cd dashboard && bun install' to install dependencies");
    return;
  }

  if (isDashboardRunning()) {
    const port = getDashboardPort();
    console.error(`[Dashboard] Dashboard already running on http://localhost:${port || "?"}`);
    return;
  }

  try {
    console.error("[Dashboard] Starting dashboard server...");

    const proc = spawn("bun", ["run", "index.ts"], {
      cwd: DASHBOARD_SERVER_DIR,
      detached: true,
      stdio: "ignore",
      env: { ...process.env }
    });

    proc.unref();

    // Wait a bit for the port file to be written
    setTimeout(() => {
      const port = getDashboardPort();
      if (port) {
        console.error(`[Dashboard] Dashboard started on http://localhost:${port}`);
      }
    }, 1000);
  } catch (err) {
    console.error("[Dashboard] Failed to start dashboard:", err);
  }
}

// ============ Agent Logic ============

/**
 * Parse token usage from stream-json log content
 */
function parseTokenUsage(logContent: string): { inputTokens: number; outputTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;

  // Parse JSONL format - each line is a JSON object
  const lines = logContent.split('\n').filter(line => line.trim());
  for (const line of lines) {
    try {
      const data = JSON.parse(line);
      // Look for usage data in the response
      if (data.usage) {
        inputTokens += data.usage.input_tokens || 0;
        outputTokens += data.usage.output_tokens || 0;
      }
      // Also check for result with usage
      if (data.result?.usage) {
        inputTokens += data.result.usage.input_tokens || 0;
        outputTokens += data.result.usage.output_tokens || 0;
      }
    } catch {
      // Skip non-JSON lines (like the header/footer we add)
    }
  }

  return { inputTokens, outputTokens };
}

/**
 * Read an agent prompt from .claude/agents/
 */
function readAgentPrompt(agentName: string): string | null {
  const agentFile = path.join(AGENTS_DIR, `${agentName}.md`);
  if (!fs.existsSync(agentFile)) {
    return null;
  }
  return fs.readFileSync(agentFile, "utf-8");
}

/**
 * List available agents
 */
function listAvailableAgents(): string[] {
  if (!fs.existsSync(AGENTS_DIR)) return [];
  return fs.readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith(".md"))
    .map(f => f.replace(".md", ""));
}

/**
 * Build the full prompt for the agent
 */
function buildFullPrompt(agentPrompt: string, task: string, mode: "investigate" | "implement"): string {
  const modeInstructions = mode === "investigate"
    ? `## MODE: INVESTIGATION (Read-Only)

IMPORTANT: You are in investigation mode. You CANNOT modify files.
- You can only READ and ANALYZE code
- Do NOT use Edit, Write, or Bash to modify anything
- Your goal is to investigate and report findings
- Be concise and direct in your response`
    : `## MODE: IMPLEMENTATION

You are in implementation mode. You can modify files.
- Implement the changes according to the agreed plan
- Be concise and update progress as you go`;

  return `# Agent Context

${agentPrompt}

${modeInstructions}

# Assigned Task

${task}

# Final Instructions

1. Execute the assigned task within your scope
2. If you find something outside your scope, report it but don't modify it
3. Be concise and direct in your response`;
}

/**
 * Spawn an agent as an independent process
 */
function spawnAgent(agentName: string, task: string, mode: "investigate" | "implement"): AgentTask | { error: string } {
  // Verify agent exists
  const agentPrompt = readAgentPrompt(agentName);
  if (!agentPrompt) {
    const available = listAvailableAgents();
    return {
      error: `Agent '${agentName}' not found. Available agents: ${available.join(", ")}`
    };
  }

  // Generate ID and paths
  const taskId = randomUUID().slice(0, 8);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(LOGS_DIR, `${agentName}_${timestamp}_${taskId}.log`);

  // Build prompt
  const fullPrompt = buildFullPrompt(agentPrompt, task, mode);
  const allowedTools = mode === "investigate" ? INVESTIGATE_TOOLS : IMPLEMENT_TOOLS;

  // Write log header
  fs.writeFileSync(logFile, `---
Agent: ${agentName}
Task ID: ${taskId}
Mode: ${mode}
Task: ${task}
Started: ${new Date().toISOString()}
---

`);

  // Spawn claude -p as independent process
  const logStream = fs.openSync(logFile, "a");

  const proc = spawn("claude", [
    "-p", fullPrompt,
    "--allowedTools", allowedTools,
    "--verbose",
    "--output-format", "stream-json"
  ], {
    detached: true,
    stdio: ["ignore", logStream, logStream],
    cwd: PROJECT_ROOT,
    env: { ...process.env }
  });

  // Detach the process
  proc.unref();

  // Create task record
  const agentTask: AgentTask = {
    id: taskId,
    agentName,
    task,
    mode,
    status: "running",
    pid: proc.pid || null,
    logFile,
    startedAt: new Date(),
    completedAt: null,
    exitCode: null
  };

  // Insert into dashboard DB
  dbInsertAgent(agentTask);

  // Monitor when finished
  proc.on("exit", (code) => {
    const task = runningAgents.get(taskId);
    if (task) {
      task.status = code === 0 ? "completed" : "failed";
      task.completedAt = new Date();
      task.exitCode = code;

      // Update dashboard DB
      dbUpdateAgentStatus(taskId, task.status, code);

      // Parse and update token usage
      try {
        const logContent = fs.readFileSync(logFile, "utf-8");
        const { inputTokens, outputTokens } = parseTokenUsage(logContent);
        if (inputTokens > 0 || outputTokens > 0) {
          dbUpdateAgentTokens(taskId, inputTokens, outputTokens);
        }
      } catch (err) {
        console.error("[Dashboard] Failed to parse token usage:", err);
      }

      // Add log footer
      fs.appendFileSync(logFile, `\n---
Finished: ${new Date().toISOString()}
Exit Code: ${code}
---`);
    }
    fs.closeSync(logStream);
  });

  proc.on("error", (err) => {
    const task = runningAgents.get(taskId);
    if (task) {
      task.status = "failed";
      task.completedAt = new Date();

      // Update dashboard DB
      dbUpdateAgentStatus(taskId, "failed", null);
    }
    fs.appendFileSync(logFile, `\n---
Error: ${err.message}
---`);
    fs.closeSync(logStream);
  });

  runningAgents.set(taskId, agentTask);

  return agentTask;
}

/**
 * Check if an agent process is still running
 */
function isAgentRunning(task: AgentTask): boolean {
  if (task.status !== "running" || !task.pid) {
    return false;
  }
  try {
    // Send signal 0 to check if exists
    process.kill(task.pid, 0);
    return true;
  } catch {
    // Process no longer exists
    task.status = "completed";
    task.completedAt = new Date();

    // Update dashboard DB
    dbUpdateAgentStatus(task.id, "completed", 0);

    return false;
  }
}

/**
 * Wait for an agent to complete (blocking)
 */
async function waitForAgent(task: AgentTask, timeoutMs: number): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 500; // Check every 500ms

  while (isAgentRunning(task)) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for agent after ${timeoutMs}ms`);
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}

/**
 * Get the status of an agent with final result summary
 * @param block - If true, wait for agent to complete before returning
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 5 minutes)
 */
async function getAgentStatus(
  taskId: string,
  block: boolean = false,
  timeoutMs: number = 300000
): Promise<{ task: AgentTask; timedOut?: boolean; result?: LogEntry } | { error: string }> {
  const task = runningAgents.get(taskId);
  if (!task) {
    return { error: `Task '${taskId}' not found` };
  }

  // If blocking, wait for completion
  if (block && task.status === "running") {
    try {
      await waitForAgent(task, timeoutMs);
    } catch (err: any) {
      return { task, timedOut: true };
    }
  } else {
    // Non-blocking: just check current status
    isAgentRunning(task);
  }

  // Extract final result from parsed log if agent completed
  let result: LogEntry | undefined;
  if (task.status !== "running" && fs.existsSync(task.logFile)) {
    try {
      const rawLog = fs.readFileSync(task.logFile, "utf-8");
      const entries = parseLog(rawLog);
      result = entries.find(e => e.type === "result");
    } catch { /* ignore parse errors */ }
  }

  return { task, result };
}

/**
 * List all agents (running and completed)
 */
function listAgents(): AgentTask[] {
  return Array.from(runningAgents.values());
}

/**
 * Terminate an agent
 */
function killAgent(taskId: string): { success: boolean; error?: string } {
  const task = runningAgents.get(taskId);
  if (!task) {
    return { success: false, error: `Task '${taskId}' not found` };
  }

  if (task.status !== "running" || !task.pid) {
    return { success: false, error: `Task '${taskId}' is not running` };
  }

  try {
    process.kill(task.pid, "SIGTERM");
    task.status = "failed";
    task.completedAt = new Date();

    // Update dashboard DB
    dbUpdateAgentStatus(taskId, "failed", -1);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============ MCP Server Setup ============

const server = new McpServer({
  name: "orchestrator",
  version: "1.0.0",
});

// Tool: spawn_agent
server.tool(
  "spawn_agent",
  "Launch a Claude agent to perform a task. Returns a task ID to monitor progress.",
  {
    agent: z.string().describe("Name of the agent (e.g., 'database', 'api', 'frontend')"),
    task: z.string().describe("The task/prompt for the agent to execute"),
    mode: z.enum(["investigate", "implement"]).describe("Mode: 'investigate' (read-only) or 'implement' (can modify files)")
  },
  async ({ agent, task, mode }) => {
    const result = spawnAgent(agent, task, mode);

    if ("error" in result) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: result.error }, null, 2) }]
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          taskId: result.id,
          agent: result.agentName,
          mode: result.mode,
          status: result.status,
          logFile: result.logFile,
          message: `Agent '${agent}' spawned with task ID '${result.id}'. Use get_agent_status to check progress.`
        }, null, 2)
      }]
    };
  }
);

// Tool: get_agent_status
server.tool(
  "get_agent_status",
  "Get the status of an agent task with final result summary. Use block=true to wait for completion.",
  {
    taskId: z.string().describe("The task ID returned by spawn_agent"),
    block: z.boolean().optional().default(false).describe("If true, wait for agent to complete before returning (default: false)"),
    timeout: z.number().optional().default(300000).describe("Maximum time to wait in milliseconds when blocking (default: 300000 = 5 minutes)")
  },
  async ({ taskId, block, timeout }) => {
    const statusResult = await getAgentStatus(taskId, block, timeout);

    if ("error" in statusResult) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: statusResult.error }, null, 2) }]
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          taskId: statusResult.task.id,
          agent: statusResult.task.agentName,
          status: statusResult.task.status,
          mode: statusResult.task.mode,
          startedAt: statusResult.task.startedAt,
          completedAt: statusResult.task.completedAt,
          exitCode: statusResult.task.exitCode,
          timedOut: statusResult.timedOut || false,
          // Include result summary if available (final message from agent)
          ...(statusResult.result && {
            result: {
              summary: statusResult.result.content,
              stats: statusResult.result.stats
            }
          })
        }, null, 2)
      }]
    };
  }
);

// Tool: list_agents
server.tool(
  "list_agents",
  "List all spawned agents (running and completed) in this session.",
  {},
  async () => {
    const agents = listAgents();
    const available = listAvailableAgents();

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          availableAgents: available,
          spawnedAgents: agents.map(a => ({
            taskId: a.id,
            agent: a.agentName,
            status: a.status,
            mode: a.mode,
            task: a.task.slice(0, 100) + (a.task.length > 100 ? "..." : ""),
            startedAt: a.startedAt
          }))
        }, null, 2)
      }]
    };
  }
);

// Tool: kill_agent
server.tool(
  "kill_agent",
  "Terminate a running agent.",
  {
    taskId: z.string().describe("The task ID of the agent to kill")
  },
  async ({ taskId }) => {
    const result = killAgent(taskId);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
);

// Tool: get_agent_activity
server.tool(
  "get_agent_activity",
  "Get structured activity log from an agent. Returns parsed entries (text, tool calls, results) instead of raw JSON. Best way to understand what an agent did.",
  {
    taskId: z.string().describe("The task ID to get activity for"),
    filter: z.enum(["all", "text", "tools", "result"]).optional().describe("Filter entries: 'all' (default), 'text' (assistant messages), 'tools' (tool calls + results), 'result' (final summary only)"),
    limit: z.number().optional().describe("Maximum number of entries to return (default: 50)"),
    tail: z.boolean().optional().describe("If true, return the last N entries instead of first N")
  },
  async ({ taskId, filter = "all", limit = 50, tail = false }) => {
    const task = runningAgents.get(taskId);
    if (!task) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `Task '${taskId}' not found` }) }]
      };
    }

    if (!fs.existsSync(task.logFile)) {
      return {
        content: [{ type: "text", text: JSON.stringify({ entries: [], message: "No output yet" }) }]
      };
    }

    const rawLog = fs.readFileSync(task.logFile, "utf-8");
    let entries = parseLog(rawLog);

    // Apply filter
    if (filter === "text") {
      entries = entries.filter(e => e.type === "text");
    } else if (filter === "tools") {
      entries = entries.filter(e => e.type === "tool_call" || e.type === "tool_result");
    } else if (filter === "result") {
      entries = entries.filter(e => e.type === "result");
    }

    const totalEntries = entries.length;

    // Apply limit (from start or end)
    if (tail) {
      entries = entries.slice(-limit);
    } else {
      entries = entries.slice(0, limit);
    }

    // Truncate long content to keep response size reasonable
    const truncatedEntries = entries.map(e => ({
      ...e,
      content: e.content.length > 1000 ? e.content.slice(0, 1000) + "... [truncated]" : e.content
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          taskId,
          agent: task.agentName,
          status: task.status,
          totalEntries,
          returnedEntries: truncatedEntries.length,
          filter,
          entries: truncatedEntries
        }, null, 2)
      }]
    };
  }
);

// Tool: search_agent_activity
server.tool(
  "search_agent_activity",
  "Search through parsed agent activity using regex. Searches in content, toolName, and toolInput fields. Returns matching entries with context.",
  {
    taskId: z.string().describe("The task ID to search"),
    pattern: z.string().describe("Regex pattern to search for in parsed content"),
    filter: z.enum(["all", "text", "tools", "result"]).optional().describe("Filter entries before searching: 'all' (default), 'text', 'tools', 'result'"),
    maxMatches: z.number().optional().describe("Maximum number of matching entries to return (default: 20)"),
    includeContext: z.boolean().optional().describe("If true, include 1 entry before and after each match (default: false)"),
    maxContentLength: z.number().optional().describe("Truncate content longer than this (default: 500)")
  },
  async ({ taskId, pattern, filter = "all", maxMatches = 20, includeContext = false, maxContentLength = 500 }) => {
    const task = runningAgents.get(taskId);
    if (!task) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `Task '${taskId}' not found` }) }]
      };
    }

    if (!fs.existsSync(task.logFile)) {
      return {
        content: [{ type: "text", text: JSON.stringify({ matches: [], message: "No output yet" }) }]
      };
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, "i");
    } catch (e) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `Invalid regex pattern: ${pattern}` }) }]
      };
    }

    const rawLog = fs.readFileSync(task.logFile, "utf-8");
    let entries = parseLog(rawLog);

    // Apply type filter first
    if (filter === "text") {
      entries = entries.filter(e => e.type === "text");
    } else if (filter === "tools") {
      entries = entries.filter(e => e.type === "tool_call" || e.type === "tool_result");
    } else if (filter === "result") {
      entries = entries.filter(e => e.type === "result");
    }

    // Search in content, toolName, toolInput
    const matchIndices: number[] = [];
    for (let i = 0; i < entries.length && matchIndices.length < maxMatches; i++) {
      const e = entries[i];
      const searchText = [e.content, e.toolName || "", e.toolInput || ""].join(" ");
      if (regex.test(searchText)) {
        matchIndices.push(i);
      }
    }

    // Collect matches with optional context
    const resultIndices = new Set<number>();
    for (const idx of matchIndices) {
      if (includeContext && idx > 0) resultIndices.add(idx - 1);
      resultIndices.add(idx);
      if (includeContext && idx < entries.length - 1) resultIndices.add(idx + 1);
    }

    // Build result entries with match indicators
    const truncate = (s: string) => s.length > maxContentLength ? s.slice(0, maxContentLength) + "..." : s;
    const resultEntries = Array.from(resultIndices).sort((a, b) => a - b).map(idx => ({
      index: idx,
      isMatch: matchIndices.includes(idx),
      type: entries[idx].type,
      content: truncate(entries[idx].content),
      ...(entries[idx].toolName && { toolName: entries[idx].toolName }),
      ...(entries[idx].toolInput && { toolInput: truncate(entries[idx].toolInput || "") }),
      ...(entries[idx].stats && { stats: entries[idx].stats })
    }));

    const totalMatches = entries.filter(e => {
      const searchText = [e.content, e.toolName || "", e.toolInput || ""].join(" ");
      return regex.test(searchText);
    }).length;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          taskId,
          agent: task.agentName,
          status: task.status,
          pattern,
          filter,
          totalMatches,
          returnedMatches: matchIndices.length,
          entriesReturned: resultEntries.length,
          matches: resultEntries
        }, null, 2)
      }]
    };
  }
);

// Cleanup on exit
function cleanup() {
  dbEndSession();
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

process.on("exit", cleanup);

// Start the server
async function main() {
  // Initialize dashboard integration
  initDashboardDB();

  // Auto-start dashboard if not running
  ensureDashboardRunning();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`MCP Orchestrator Server running on stdio (project: ${PROJECT_NAME}, session: ${sessionId})`);
}

main().catch(console.error);
