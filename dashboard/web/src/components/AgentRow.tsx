import type { Agent } from "../types";

interface AgentRowProps {
  agent: Agent;
  selected: boolean;
  showProject: boolean;
  onClick: () => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }
  return `0:${remainingSeconds.toString().padStart(2, "0")}`;
}

function getStatusIcon(status: Agent["status"]): string {
  switch (status) {
    case "running":
      return "\u25CF"; // ●
    case "completed":
      return "\u2713"; // ✓
    case "failed":
      return "\u2717"; // ✗
  }
}

function truncateTask(task: string, maxLength: number = 60): string {
  if (task.length <= maxLength) return task;
  return task.slice(0, maxLength) + "...";
}

export function AgentRow({ agent, selected, showProject, onClick }: AgentRowProps) {
  return (
    <div
      className={`agent-row ${selected ? "selected" : ""}`}
      onClick={onClick}
    >
      <div className="agent-row-header">
        <span className={`status-icon ${agent.status}`}>
          {getStatusIcon(agent.status)}
        </span>
        <span className="agent-name">{agent.agent_name}</span>
        <span className={`mode-badge ${agent.mode}`}>{agent.mode}</span>
        <span className="status-text">{agent.status}</span>
        <span className="duration">{formatDuration(agent.duration)}</span>
        {agent.exit_code !== null && (
          <span className={`exit-code ${agent.exit_code === 0 ? "success" : "error"}`}>
            {agent.exit_code}
          </span>
        )}
        {showProject && (
          <span className="project-tag">{agent.project_name}</span>
        )}
      </div>
      <div className="agent-row-task">{truncateTask(agent.task)}</div>
    </div>
  );
}
