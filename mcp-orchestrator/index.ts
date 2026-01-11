#!/usr/bin/env bun
/**
 * MCP Orchestrator Server
 *
 * Enables Claude Code to spawn and monitor subagents using `claude -p`
 * Agents run as independent processes and write to log files.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

// Project root directory (parent of mcp-orchestrator)
const PROJECT_ROOT = path.resolve(import.meta.dir, "..");
const AGENTS_DIR = path.join(PROJECT_ROOT, ".claude", "agents");
const LOGS_DIR = path.join(PROJECT_ROOT, ".claude", "logs");

// Ensure directories exist
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

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

// Global state of agents
const runningAgents: Map<string, AgentTask> = new Map();

// Allowed tools by mode
const INVESTIGATE_TOOLS = "Read,Glob,Grep,LS,WebFetch,WebSearch";
const IMPLEMENT_TOOLS = "Read,Glob,Grep,LS,Edit,Write,Bash,WebFetch,WebSearch";

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
    "--output-format", "text"
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

  // Monitor when finished
  proc.on("exit", (code) => {
    const task = runningAgents.get(taskId);
    if (task) {
      task.status = code === 0 ? "completed" : "failed";
      task.completedAt = new Date();
      task.exitCode = code;

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
 * Get the status and output of an agent
 */
function getAgentStatus(taskId: string): { task: AgentTask; output: string } | { error: string } {
  const task = runningAgents.get(taskId);
  if (!task) {
    return { error: `Task '${taskId}' not found` };
  }

  // Check if process is still running
  if (task.status === "running" && task.pid) {
    try {
      // Send signal 0 to check if exists
      process.kill(task.pid, 0);
    } catch {
      // Process no longer exists
      task.status = "completed";
      task.completedAt = new Date();
    }
  }

  // Read log
  let output = "";
  if (fs.existsSync(task.logFile)) {
    output = fs.readFileSync(task.logFile, "utf-8");
  }

  return { task, output };
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
  "Get the status and output of a running or completed agent task.",
  {
    taskId: z.string().describe("The task ID returned by spawn_agent")
  },
  async ({ taskId }) => {
    const result = getAgentStatus(taskId);

    if ("error" in result) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: result.error }, null, 2) }]
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          taskId: result.task.id,
          agent: result.task.agentName,
          status: result.task.status,
          mode: result.task.mode,
          startedAt: result.task.startedAt,
          completedAt: result.task.completedAt,
          exitCode: result.task.exitCode,
          output: result.output
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

// Tool: read_agent_log
server.tool(
  "read_agent_log",
  "Read the full log file of an agent task.",
  {
    taskId: z.string().describe("The task ID to read logs for")
  },
  async ({ taskId }) => {
    const task = runningAgents.get(taskId);
    if (!task) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `Task '${taskId}' not found` }) }]
      };
    }

    let output = "";
    if (fs.existsSync(task.logFile)) {
      output = fs.readFileSync(task.logFile, "utf-8");
    }

    return {
      content: [{ type: "text", text: output || "(no output yet)" }]
    };
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Orchestrator Server running on stdio");
}

main().catch(console.error);
