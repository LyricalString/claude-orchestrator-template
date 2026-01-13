import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { SessionList } from "./components/SessionList";
import { LogViewer } from "./components/LogViewer";
import { UpdateBanner } from "./components/UpdateBanner";
import { useProjects, useStats, useVersion, useSessions, useAgents } from "./hooks/usePolling";
import { useLogSSE } from "./hooks/useSSE";
import type { Agent } from "./types";

function App() {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const { projects } = useProjects();
  const { sessions, loading: sessionsLoading } = useSessions(selectedProjectId ?? undefined);
  const { agents } = useAgents(selectedProjectId ?? undefined);
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
          <SessionList
            sessions={sessions}
            loading={sessionsLoading}
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
