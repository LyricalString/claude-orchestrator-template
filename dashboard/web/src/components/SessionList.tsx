import { useState } from "react";
import type { Session } from "../types";
import { AgentRow } from "./AgentRow";
import { useSessionAgents } from "../hooks/usePolling";

interface SessionListProps {
  sessions: Session[];
  loading: boolean;
  selectedAgentId: string | null;
  showProject: boolean;
  onSelectAgent: (agentId: string | null) => void;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function SessionList({
  sessions,
  loading,
  selectedAgentId,
  showProject,
  onSelectAgent,
}: SessionListProps) {
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    new Set()
  );

  if (loading) {
    return <div className="loading">Loading sessions...</div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">&gt;_</div>
        <h3>No sessions yet</h3>
        <p>Sessions will appear here when you use the orchestrator</p>
      </div>
    );
  }

  const toggleSession = (sessionId: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  return (
    <div className="session-list">
      {sessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          expanded={expandedSessions.has(session.id)}
          onToggle={() => toggleSession(session.id)}
          selectedAgentId={selectedAgentId}
          showProject={showProject}
          onSelectAgent={onSelectAgent}
        />
      ))}
    </div>
  );
}

interface SessionRowProps {
  session: Session;
  expanded: boolean;
  onToggle: () => void;
  selectedAgentId: string | null;
  showProject: boolean;
  onSelectAgent: (agentId: string | null) => void;
}

function SessionRow({
  session,
  expanded,
  onToggle,
  selectedAgentId,
  showProject,
  onSelectAgent,
}: SessionRowProps) {
  const { agents } = useSessionAgents(expanded ? session.id : null);

  const isActive = session.status === "active";
  const statusIcon = isActive ? "\u25B6" : "\u25A0";
  const statusClass = isActive ? "running" : "completed";

  return (
    <div className="session-row">
      <div className="session-header" onClick={onToggle}>
        <span className={`session-expand ${expanded ? "expanded" : ""}`}>
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
        <span className={`status-icon ${statusClass}`}>{statusIcon}</span>
        <span className="session-id">Session {session.id}</span>
        {showProject && (
          <span className="project-tag">{session.project_name}</span>
        )}
        <span className="session-agents">
          {session.running_count > 0 && (
            <span className="running-badge">{session.running_count} running</span>
          )}
          <span className="agent-count">{session.agent_count} agents</span>
        </span>
        <span className="session-time">{formatTime(session.started_at)}</span>
        <span className="duration">{formatDuration(session.duration)}</span>
      </div>

      {expanded && agents.length > 0 && (
        <div className="session-agents-list">
          {agents.map((agent) => (
            <AgentRow
              key={agent.id}
              agent={agent}
              selected={selectedAgentId === agent.id}
              showProject={false}
              onClick={() =>
                onSelectAgent(selectedAgentId === agent.id ? null : agent.id)
              }
            />
          ))}
        </div>
      )}

      {expanded && agents.length === 0 && (
        <div className="session-agents-empty">No agents in this session</div>
      )}
    </div>
  );
}
