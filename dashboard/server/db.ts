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
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  )
`);

// Migrations for existing DBs
try {
  db.run(`ALTER TABLE agents ADD COLUMN input_tokens INTEGER DEFAULT 0`);
} catch {
  // Column already exists
}
try {
  db.run(`ALTER TABLE agents ADD COLUMN output_tokens INTEGER DEFAULT 0`);
} catch {
  // Column already exists
}
try {
  db.run(`ALTER TABLE agents ADD COLUMN session_id TEXT`);
} catch {
  // Column already exists
}

// Create indexes
db.run(`CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_agents_started ON agents(started_at DESC)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(session_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC)`);

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
  session_id: string | null;
  agent_name: string;
  task: string;
  mode: string;
  status: string;
  pid: number | null;
  log_file: string;
  started_at: string;
  completed_at: string | null;
  exit_code: number | null;
  input_tokens: number;
  output_tokens: number;
}

export interface Session {
  id: string;
  project_id: number;
  project_name?: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  agent_count?: number;
  running_count?: number;
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
  session_id?: string | null;
  agent_name: string;
  task: string;
  mode: string;
  pid: number | null;
  log_file: string;
}): void {
  db.run(`
    INSERT INTO agents (id, project_id, session_id, agent_name, task, mode, pid, log_file, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running')
  `, [agent.id, agent.project_id, agent.session_id || null, agent.agent_name, agent.task, agent.mode, agent.pid, agent.log_file]);

  // Update project last_activity_at
  db.run("UPDATE projects SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?", [agent.project_id]);
}

// Session functions
export function createSession(id: string, projectId: number): void {
  db.run(`
    INSERT INTO sessions (id, project_id, status)
    VALUES (?, ?, 'active')
  `, [id, projectId]);

  db.run("UPDATE projects SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?", [projectId]);
}

export function endSession(id: string): void {
  db.run(`
    UPDATE sessions
    SET status = 'ended', ended_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [id]);
}

export function getSession(id: string): Session | null {
  return db.query<Session, [string]>(`
    SELECT s.*, p.name as project_name,
      (SELECT COUNT(*) FROM agents a WHERE a.session_id = s.id) as agent_count,
      (SELECT COUNT(*) FROM agents a WHERE a.session_id = s.id AND a.status = 'running') as running_count
    FROM sessions s
    JOIN projects p ON s.project_id = p.id
    WHERE s.id = ?
  `).get(id);
}

export function getSessions(projectId?: number, limit: number = 50): Session[] {
  let query = `
    SELECT s.*, p.name as project_name,
      (SELECT COUNT(*) FROM agents a WHERE a.session_id = s.id) as agent_count,
      (SELECT COUNT(*) FROM agents a WHERE a.session_id = s.id AND a.status = 'running') as running_count
    FROM sessions s
    JOIN projects p ON s.project_id = p.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (projectId) {
    query += " AND s.project_id = ?";
    params.push(projectId);
  }

  query += " ORDER BY s.started_at DESC LIMIT ?";
  params.push(limit);

  return db.query<Session, (string | number)[]>(query).all(...params);
}

export function getSessionAgents(sessionId: string): Agent[] {
  return db.query<Agent, [string]>(`
    SELECT a.*, p.name as project_name
    FROM agents a
    JOIN projects p ON a.project_id = p.id
    WHERE a.session_id = ?
    ORDER BY a.started_at ASC
  `).all(sessionId);
}

export function updateAgentStatus(id: string, status: string, exitCode: number | null): void {
  db.run(`
    UPDATE agents
    SET status = ?, exit_code = ?, completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [status, exitCode, id]);
}

export function updateAgentTokens(id: string, inputTokens: number, outputTokens: number): void {
  db.run(`
    UPDATE agents
    SET input_tokens = ?, output_tokens = ?
    WHERE id = ?
  `, [inputTokens, outputTokens, id]);
}

export function getStats(): {
  running: number;
  completed: number;
  failed: number;
  total_input_tokens: number;
  total_output_tokens: number;
} {
  const result = db.query<
    {
      running: number;
      completed: number;
      failed: number;
      total_input_tokens: number;
      total_output_tokens: number;
    },
    []
  >(`
    SELECT
      COUNT(CASE WHEN status = 'running' THEN 1 END) as running,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens
    FROM agents
  `).get();

  return result ?? {
    running: 0,
    completed: 0,
    failed: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
  };
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
