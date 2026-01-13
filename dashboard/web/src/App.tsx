import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { AgentList } from "./components/AgentList";
import { LogViewer } from "./components/LogViewer";
import { UpdateBanner } from "./components/UpdateBanner";
import { useProjects, useStats, useVersion } from "./hooks/usePolling";
import { useAgentsSSE, useLogSSE } from "./hooks/useSSE";
import type { Agent } from "./types";

function App() {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const { projects, loading: projectsLoading } = useProjects();
  const { agents, connected } = useAgentsSSE(selectedProjectId ?? undefined);
  const stats = useStats();
  const log = useLogSSE(selectedAgentId);
  const { version, dismissed, dismiss } = useVersion();

  const selectedAgent: Agent | null =
    agents.find((a) => a.id === selectedAgentId) ?? null;

  return (
    <div className="app">
      {version && !dismissed && (
        <UpdateBanner version={version} onDismiss={dismiss} />
      )}

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
            loading={!connected}
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
