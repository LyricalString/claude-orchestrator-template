import { useState, useEffect, useCallback, useRef } from "react";
import type { Project, Agent, Stats, LogResponse } from "../types";

const POLL_INTERVAL = 2000;

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/projects");
        const data = await res.json();
        setProjects(data);
      } catch (err) {
        console.error("Failed to fetch projects:", err);
      } finally {
        setLoading(false);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return { projects, loading };
}

export function useAgents(projectId?: number) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const poll = async () => {
      try {
        const url = projectId
          ? `/api/agents?project_id=${projectId}`
          : "/api/agents";
        const res = await fetch(url);
        const data = await res.json();
        setAgents(data);
      } catch (err) {
        console.error("Failed to fetch agents:", err);
      } finally {
        setLoading(false);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [projectId]);

  return { agents, loading };
}

export function useStats() {
  const [stats, setStats] = useState<Stats>({ running: 0, completed: 0, failed: 0 });

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/stats");
        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return stats;
}

export function useLogStream(agentId: string | null) {
  const [log, setLog] = useState("");
  const offsetRef = useRef(0);

  // Reset when agent changes
  useEffect(() => {
    setLog("");
    offsetRef.current = 0;
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}/log?offset=${offsetRef.current}`);
        const data: LogResponse = await res.json();

        if (data.content) {
          setLog((prev) => prev + data.content);
          offsetRef.current = data.size;
        }
      } catch (err) {
        console.error("Failed to fetch log:", err);
      }
    };

    poll();
    const interval = setInterval(poll, 1000); // Faster polling for logs
    return () => clearInterval(interval);
  }, [agentId]);

  return log;
}
