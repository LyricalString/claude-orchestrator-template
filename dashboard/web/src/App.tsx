import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { AgentList } from "./components/AgentList";
import { LogViewer } from "./components/LogViewer";
import { useProjects, useAgents, useStats, useLogStream } from "./hooks/usePolling";
import type { Agent } from "./types";

function App() {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const { projects, loading: projectsLoading } = useProjects();
  const { agents, loading: agentsLoading } = useAgents(selectedProjectId ?? undefined);
  const stats = useStats();
  const log = useLogStream(selectedAgentId);

  const selectedAgent: Agent | null =
    agents.find((a) => a.id === selectedAgentId) ?? null;

  return (
    <div className="app">
      <header className="header">
        <h1>Claude Orchestrator Dashboard</h1>
        <div className="stats">
          <span className="stat running">
            <span>{stats.running}</span> running
          </span>
          <span className="stat completed">
            <span>{stats.completed}</span> completed
          </span>
          <span className="stat failed">
            <span>{stats.failed}</span> failed
          </span>
        </div>
      </header>

      <main className="main">
        <Sidebar
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={(id) => {
            setSelectedProjectId(id);
            setSelectedAgentId(null);
          }}
        />

        <div className="content">
          <AgentList
            agents={agents}
            loading={agentsLoading}
            selectedAgentId={selectedAgentId}
            showProject={selectedProjectId === null}
            onSelectAgent={setSelectedAgentId}
          />

          {selectedAgentId && (
            <LogViewer
              agent={selectedAgent}
              log={log}
              onClose={() => setSelectedAgentId(null)}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
