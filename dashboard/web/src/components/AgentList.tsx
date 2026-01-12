import type { Agent } from "../types";
import { AgentRow } from "./AgentRow";

interface AgentListProps {
  agents: Agent[];
  loading: boolean;
  selectedAgentId: string | null;
  showProject: boolean;
  onSelectAgent: (agentId: string | null) => void;
}

export function AgentList({
  agents,
  loading,
  selectedAgentId,
  showProject,
  onSelectAgent,
}: AgentListProps) {
  if (loading) {
    return <div className="loading">Loading agents...</div>;
  }

  if (agents.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">&gt;_</div>
        <h3>No agents yet</h3>
        <p>Agents will appear here when spawned by the orchestrator</p>
      </div>
    );
  }

  return (
    <div className="agent-list">
      {agents.map((agent) => (
        <AgentRow
          key={agent.id}
          agent={agent}
          selected={selectedAgentId === agent.id}
          showProject={showProject}
          onClick={() =>
            onSelectAgent(selectedAgentId === agent.id ? null : agent.id)
          }
        />
      ))}
    </div>
  );
}
