import { useState, useEffect, useRef } from "react";
import type { Agent } from "../types";

export function useAgentsSSE(projectId?: number) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connected, setConnected] = useState(false);
  const hasReceivedData = useRef(false);

  useEffect(() => {
    // Reset data state on project change
    hasReceivedData.current = false;
    setConnected(false);

    const url = projectId
      ? `/api/events?project_id=${projectId}`
      : "/api/events";

    const eventSource = new EventSource(url);

    eventSource.onopen = () => setConnected(true);
    eventSource.onerror = () => {
      // Only set disconnected if we haven't received data yet
      // This prevents "Loading..." flicker during reconnection
      if (!hasReceivedData.current) {
        setConnected(false);
      }
    };

    eventSource.addEventListener("agents", (e) => {
      hasReceivedData.current = true;
      setConnected(true);
      const data = JSON.parse(e.data);
      setAgents(
        data.map((agent: Agent) => ({
          ...agent,
          duration: agent.completed_at
            ? new Date(agent.completed_at).getTime() -
              new Date(agent.started_at).getTime()
            : Date.now() - new Date(agent.started_at).getTime(),
        }))
      );
    });

    return () => eventSource.close();
  }, [projectId]);

  return { agents, connected };
}

export function useLogSSE(agentId: string | null) {
  const [log, setLog] = useState("");

  useEffect(() => {
    if (!agentId) {
      setLog("");
      return;
    }

    const eventSource = new EventSource(`/api/events?agent_id=${agentId}`);

    eventSource.addEventListener("log", (e) => {
      const data = JSON.parse(e.data);
      if (data.reset) {
        setLog(data.content);
      } else {
        setLog((prev) => prev + data.content);
      }
    });

    return () => eventSource.close();
  }, [agentId]);

  return log;
}
