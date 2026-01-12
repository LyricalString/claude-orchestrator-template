import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// Data directory shared across all projects
const DATA_DIR = join(homedir(), ".claude-orchestrator");
const DB_PATH = join(DATA_DIR, "orchestrator.db");

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.run("PRAGMA journal_mode = WAL");

// Initialize schema
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
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    project_id INTEGER NOT NULL,
    agent_name TEXT NOT NULL,
    task TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    pid INTEGER,
    log_file TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    exit_code INTEGER,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  )
`);

// Create indexes
db.run(`CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_agents_started ON agents(started_at DESC)`);

// Helper functions
export function getOrCreateProject(name: string, path: string): number {
  const existing = db.query<{ id: number }, [string]>(
    "SELECT id FROM projects WHERE name = ?"
  ).get(name);

  if (existing) {
    db.run(
      "UPDATE projects SET last_activity_at = CURRENT_TIMESTAMP, path = ? WHERE id = ?",
      [path, existing.id]
    );
    return existing.id;
  }

  const result = db.run(
    "INSERT INTO projects (name, path) VALUES (?, ?)",
    [name, path]
  );
  return Number(result.lastInsertRowid);
}

export interface Project {
  id: number;
  name: string;
  path: string;
  first_seen_at: string;
  last_activity_at: string;
  activeAgents?: number;
}

export interface Agent {
  id: string;
  project_id: number;
  project_name?: string;
  agent_name: string;
  task: string;
  mode: string;
  status: string;
  pid: number | null;
  log_file: string;
  started_at: string;
  completed_at: string | null;
  exit_code: number | null;
}

export function getAllProjects(): Project[] {
  return db.query<Project, []>(`
    SELECT
      p.*,
      (SELECT COUNT(*) FROM agents a WHERE a.project_id = p.id AND a.status = 'running') as activeAgents
    FROM projects p
    ORDER BY p.last_activity_at DESC
  `).all();
}

export function getAgents(projectId?: number, status?: string): Agent[] {
  let query = `
    SELECT a.*, p.name as project_name
    FROM agents a
    JOIN projects p ON a.project_id = p.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (projectId) {
    query += " AND a.project_id = ?";
    params.push(projectId);
  }

  if (status) {
    query += " AND a.status = ?";
    params.push(status);
  }

  query += " ORDER BY a.started_at DESC";

  return db.query<Agent, (string | number)[]>(query).all(...params);
}

export function getAgent(id: string): Agent | null {
  return db.query<Agent, [string]>(`
    SELECT a.*, p.name as project_name
    FROM agents a
    JOIN projects p ON a.project_id = p.id
    WHERE a.id = ?
  `).get(id);
}

export function insertAgent(agent: {
  id: string;
  project_id: number;
  agent_name: string;
  task: string;
  mode: string;
  pid: number | null;
  log_file: string;
}): void {
  db.run(`
    INSERT INTO agents (id, project_id, agent_name, task, mode, pid, log_file, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'running')
  `, [agent.id, agent.project_id, agent.agent_name, agent.task, agent.mode, agent.pid, agent.log_file]);

  // Update project last_activity_at
  db.run("UPDATE projects SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?", [agent.project_id]);
}

export function updateAgentStatus(id: string, status: string, exitCode: number | null): void {
  db.run(`
    UPDATE agents
    SET status = ?, exit_code = ?, completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [status, exitCode, id]);
}

export function getStats(): { running: number; completed: number; failed: number } {
  const result = db.query<{ status: string; count: number }, []>(`
    SELECT status, COUNT(*) as count
    FROM agents
    GROUP BY status
  `).all();

  const stats = { running: 0, completed: 0, failed: 0 };
  for (const row of result) {
    if (row.status in stats) {
      stats[row.status as keyof typeof stats] = row.count;
    }
  }
  return stats;
}

export function cleanupOldData(daysToKeep: number = 7): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);

  const result = db.run(`
    DELETE FROM agents
    WHERE started_at < ? AND status != 'running'
  `, [cutoff.toISOString()]);

  return result.changes;
}

export { DATA_DIR, DB_PATH };
