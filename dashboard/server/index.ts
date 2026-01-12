import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { readFileSync, existsSync, writeFileSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { createServer } from "net";
import chokidar from "chokidar";
import {
  getAllProjects,
  getAgents,
  getAgent,
  getStats,
  cleanupOldData,
  DATA_DIR,
} from "./db";

const app = new Hono();
const BASE_PORT = 4000;
const MAX_PORT = 4100;

// Data files stored in shared directory (~/.claude-orchestrator/)
const LOGS_DIR = join(DATA_DIR, "logs");
const PID_FILE = join(DATA_DIR, "dashboard.pid");
const PORT_FILE = join(DATA_DIR, "dashboard.port");

/**
 * Find an available port starting from basePort
 */
async function findAvailablePort(basePort: number, maxPort: number): Promise<number> {
  for (let port = basePort; port <= maxPort; port++) {
    const available = await checkPortAvailable(port);
    if (available) {
      return port;
    }
  }
  throw new Error(`No available port found in range ${basePort}-${maxPort}`);
}

function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });
}

// Cleanup function
function cleanup() {
  try {
    if (existsSync(PID_FILE)) {
      const pid = readFileSync(PID_FILE, "utf-8").trim();
      if (pid === String(process.pid)) {
        unlinkSync(PID_FILE);
      }
    }
    if (existsSync(PORT_FILE)) {
      unlinkSync(PORT_FILE);
    }
  } catch {}
}

// Cleanup on exit
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

// Run cleanup on startup
const cleaned = cleanupOldData(7);
if (cleaned > 0) {
  console.log(`Cleaned up ${cleaned} old agent records`);
}

// Enable CORS for development
app.use("/api/*", cors());

// API Routes
app.get("/api/projects", (c) => {
  const projects = getAllProjects();
  return c.json(projects);
});

app.get("/api/agents", (c) => {
  const projectId = c.req.query("project_id");
  const status = c.req.query("status");

  const agents = getAgents(
    projectId ? parseInt(projectId) : undefined,
    status || undefined
  );

  // Calculate duration for each agent
  const agentsWithDuration = agents.map((agent) => ({
    ...agent,
    duration: agent.completed_at
      ? new Date(agent.completed_at).getTime() - new Date(agent.started_at).getTime()
      : Date.now() - new Date(agent.started_at).getTime(),
  }));

  return c.json(agentsWithDuration);
});

app.get("/api/agents/:id", (c) => {
  const id = c.req.param("id");
  const agent = getAgent(id);

  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  return c.json({
    ...agent,
    duration: agent.completed_at
      ? new Date(agent.completed_at).getTime() - new Date(agent.started_at).getTime()
      : Date.now() - new Date(agent.started_at).getTime(),
  });
});

app.get("/api/agents/:id/log", async (c) => {
  const id = c.req.param("id");
  const offset = parseInt(c.req.query("offset") || "0");

  const agent = getAgent(id);
  if (!agent) {
    return c.json({ error: "Agent not found" }, 404);
  }

  const logPath = agent.log_file;

  if (!existsSync(logPath)) {
    return c.json({ content: "", size: 0, offset: 0 });
  }

  try {
    const stats = statSync(logPath);
    const size = stats.size;

    if (offset >= size) {
      return c.json({ content: "", size, offset });
    }

    // Read from offset
    const file = Bun.file(logPath);
    const content = await file.text();
    const newContent = content.slice(offset);

    return c.json({ content: newContent, size, offset });
  } catch (error) {
    return c.json({ error: "Failed to read log" }, 500);
  }
});

app.get("/api/stats", (c) => {
  const stats = getStats();
  return c.json(stats);
});

// Health check
app.get("/api/health", (c) => {
  return c.json({ status: "ok", pid: process.pid });
});

// Serve static files from web/dist in production
const webDistPath = join(import.meta.dirname, "..", "web", "dist");
if (existsSync(webDistPath)) {
  // Serve static assets
  app.use("/assets/*", serveStatic({ root: webDistPath }));

  // Serve index.html for all other routes (SPA)
  app.get("*", (c) => {
    const indexPath = join(webDistPath, "index.html");
    if (existsSync(indexPath)) {
      return c.html(readFileSync(indexPath, "utf-8"));
    }
    return c.text("Not found", 404);
  });
}

// Watch logs directory for changes (for future WebSocket streaming)
const watcher = chokidar.watch(LOGS_DIR, {
  persistent: true,
  ignoreInitial: true,
});

watcher.on("change", (path) => {
  // Could emit WebSocket events here in the future
  // console.log(`Log file changed: ${path}`);
});

// Start server with dynamic port
async function start() {
  const port = await findAvailablePort(BASE_PORT, MAX_PORT);

  // Write PID and port files
  writeFileSync(PID_FILE, String(process.pid));
  writeFileSync(PORT_FILE, String(port));

  const server = Bun.serve({
    port,
    fetch: app.fetch,
  });

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   Claude Orchestrator Dashboard                           ║
║   http://localhost:${String(port).padEnd(5)}                              ║
║                                                           ║
║   PID: ${String(process.pid).padEnd(10)}                                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

  return server;
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
