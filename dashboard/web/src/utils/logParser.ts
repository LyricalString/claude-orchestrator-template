/**
 * Parser for Claude's stream-json output format
 */

export interface LogEntry {
  type: "header" | "text" | "tool_call" | "tool_result" | "result" | "error";
  timestamp?: string;
  content: string;
  toolName?: string;
  toolInput?: string;
  isError?: boolean;
  stats?: {
    duration_ms: number;
    total_cost_usd: number;
    input_tokens: number;
    output_tokens: number;
    num_turns: number;
  };
}

interface StreamJsonMessage {
  type: string;
  subtype?: string;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
  result?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  num_turns?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  tool_use_result?: {
    stdout?: string;
    stderr?: string;
  };
}

export function parseLog(rawLog: string): LogEntry[] {
  const entries: LogEntry[] = [];
  const lines = rawLog.split("\n");

  let inHeader = false;
  let headerLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle header section (--- delimited)
    if (trimmed === "---") {
      if (inHeader) {
        // End of header
        entries.push({
          type: "header",
          content: headerLines.join("\n"),
        });
        headerLines = [];
      }
      inHeader = !inHeader;
      continue;
    }

    if (inHeader) {
      headerLines.push(trimmed);
      continue;
    }

    // Skip empty lines
    if (!trimmed) continue;

    // Try to parse as JSON
    try {
      const data = JSON.parse(trimmed) as StreamJsonMessage;
      const entry = parseJsonEntry(data);
      if (entry) {
        entries.push(entry);
      }
    } catch {
      // Not JSON, might be plain text
      if (trimmed && !trimmed.startsWith("{")) {
        entries.push({
          type: "text",
          content: trimmed,
        });
      }
    }
  }

  return entries;
}

function parseJsonEntry(data: StreamJsonMessage): LogEntry | null {
  // Skip init messages
  if (data.type === "system" && data.subtype === "init") {
    return null;
  }

  // Assistant message with text or tool use
  if (data.type === "assistant" && data.message?.content) {
    for (const block of data.message.content) {
      if (block.type === "text" && block.text) {
        return {
          type: "text",
          content: block.text,
        };
      }
      if (block.type === "tool_use" && block.name) {
        return {
          type: "tool_call",
          content: block.name,
          toolName: block.name,
          toolInput: block.input ? formatToolInput(block.name, block.input) : undefined,
        };
      }
    }
  }

  // Tool result
  if (data.type === "user" && data.tool_use_result) {
    const stdout = data.tool_use_result.stdout || "";
    const stderr = data.tool_use_result.stderr || "";
    const content = stderr ? `${stdout}\n${stderr}` : stdout;
    return {
      type: "tool_result",
      content: content.slice(0, 500) + (content.length > 500 ? "\n..." : ""),
      isError: !!stderr,
    };
  }

  // Final result
  if (data.type === "result") {
    return {
      type: "result",
      content: data.result || "Task completed",
      stats: {
        duration_ms: data.duration_ms || 0,
        total_cost_usd: data.total_cost_usd || 0,
        input_tokens: data.usage?.input_tokens || 0,
        output_tokens: data.usage?.output_tokens || 0,
        num_turns: data.num_turns || 0,
      },
    };
  }

  return null;
}

function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "Bash" && input.command) {
    return String(input.command);
  }
  if (toolName === "Read" && input.file_path) {
    return String(input.file_path);
  }
  if (toolName === "Glob" && input.pattern) {
    return String(input.pattern);
  }
  if (toolName === "Grep" && input.pattern) {
    return String(input.pattern);
  }
  if (toolName === "Edit" && input.file_path) {
    return String(input.file_path);
  }
  if (toolName === "Write" && input.file_path) {
    return String(input.file_path);
  }

  // Default: show first meaningful value
  const values = Object.values(input).filter(v => v && typeof v === "string");
  if (values.length > 0) {
    const val = String(values[0]);
    return val.length > 100 ? val.slice(0, 100) + "..." : val;
  }

  return "";
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
