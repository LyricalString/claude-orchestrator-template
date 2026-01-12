import { useEffect, useRef } from "react";
import type { Agent } from "../types";

interface LogViewerProps {
  agent: Agent | null;
  log: string;
  onClose: () => void;
}

export function LogViewer({ agent, log, onClose }: LogViewerProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when log updates
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [log]);

  if (!agent) {
    return null;
  }

  return (
    <div className="log-viewer">
      <div className="log-header">
        <h3>
          {agent.agent_name} - {agent.id}
        </h3>
        <button className="log-close" onClick={onClose}>
          &times;
        </button>
      </div>
      <div className="log-content" ref={contentRef}>
        {log || "Loading log..."}
      </div>
    </div>
  );
}
