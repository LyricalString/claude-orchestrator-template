import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { Agent } from "../types";
import {
  parseLog,
  formatDuration,
  formatCost,
  type LogEntry,
} from "../utils/logParser";

interface LogViewerProps {
  agent: Agent | null;
  log: string;
  onClose: () => void;
}

const MIN_HEIGHT = 150;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 300;

export function LogViewer({ agent, log, onClose }: LogViewerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);

  // Parse log entries
  const entries = useMemo(() => parseLog(log), [log]);

  // Auto-scroll to bottom when log updates
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [entries]);

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = contentRef.current?.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const newHeight = rect.bottom - e.clientY + 40; // 40px for header
      setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, newHeight)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  if (!agent) {
    return null;
  }

  return (
    <div className="log-viewer" style={{ height }}>
      <div className="resize-handle" onMouseDown={handleMouseDown} />
      <div className="log-header">
        <h3>
          <span className="log-agent-name">{agent.agent_name}</span>
          <span className="log-task-id">{agent.id}</span>
        </h3>
        <button className="log-close" onClick={onClose}>
          &times;
        </button>
      </div>
      <div className="log-content" ref={contentRef}>
        {entries.length === 0 ? (
          <div className="log-loading">Loading log...</div>
        ) : (
          entries.map((entry, i) => <LogEntryComponent key={i} entry={entry} />)
        )}
      </div>
    </div>
  );
}

function LogEntryComponent({ entry }: { entry: LogEntry }) {
  switch (entry.type) {
    case "header":
      return null; // Don't show header, it's redundant with the panel header

    case "text":
      return (
        <div className="log-entry log-entry-text">
          <div className="log-entry-content">{entry.content}</div>
        </div>
      );

    case "tool_call":
      return (
        <div className="log-entry log-entry-tool">
          <div className="log-entry-tool-header">
            <span className="tool-icon">&#9881;</span>
            <span className="tool-name">{entry.toolName}</span>
            {entry.toolInput && (
              <span className="tool-input">{entry.toolInput}</span>
            )}
          </div>
        </div>
      );

    case "tool_result":
      return (
        <div
          className={`log-entry log-entry-result ${entry.isError ? "error" : ""}`}
        >
          <pre className="tool-output">{entry.content}</pre>
        </div>
      );

    case "result":
      return (
        <div className="log-entry log-entry-final">
          <div className="final-result">
            <div className="final-label">Result</div>
            <div className="final-content">{entry.content}</div>
          </div>
          {entry.stats && (
            <div className="final-stats">
              <span className="stat">
                <span className="stat-label">Duration:</span>
                <span className="stat-value">
                  {formatDuration(entry.stats.duration_ms)}
                </span>
              </span>
              <span className="stat">
                <span className="stat-label">Cost:</span>
                <span className="stat-value">
                  {formatCost(entry.stats.total_cost_usd)}
                </span>
              </span>
              <span className="stat">
                <span className="stat-label">Tokens:</span>
                <span className="stat-value">
                  {entry.stats.input_tokens.toLocaleString()} in /{" "}
                  {entry.stats.output_tokens.toLocaleString()} out
                </span>
              </span>
              <span className="stat">
                <span className="stat-label">Turns:</span>
                <span className="stat-value">{entry.stats.num_turns}</span>
              </span>
            </div>
          )}
        </div>
      );

    case "error":
      return (
        <div className="log-entry log-entry-error">
          <span className="error-icon">!</span>
          {entry.content}
        </div>
      );

    default:
      return null;
  }
}
