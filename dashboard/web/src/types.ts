export interface Project {
  id: number;
  name: string;
  path: string;
  first_seen_at: string;
  last_activity_at: string;
  activeAgents: number;
}

export interface Agent {
  id: string;
  project_id: number;
  project_name: string;
  agent_name: string;
  task: string;
  mode: "investigate" | "implement";
  status: "running" | "completed" | "failed";
  pid: number | null;
  log_file: string;
  started_at: string;
  completed_at: string | null;
  exit_code: number | null;
  duration: number;
  input_tokens: number;
  output_tokens: number;
}

export interface Stats {
  running: number;
  completed: number;
  failed: number;
  total_input_tokens: number;
  total_output_tokens: number;
}

export interface LogResponse {
  content: string;
  size: number;
  offset: number;
}

export interface VersionInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
  updateUrl: string | null;
  updateCommand: string;
}

export interface Session {
  id: string;
  project_id: number;
  project_name: string;
  started_at: string;
  ended_at: string | null;
  status: string;
  agent_count: number;
  running_count: number;
  duration: number;
}
