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
    cache_read_tokens: number;
    cache_creation_tokens: number;
    num_turns: number;
  };
}

interface StreamJsonUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
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
      tool_use_id?: string;
      content?: string | Array<{ type: string; text?: string }>;
    }>;
  };
  result?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  num_turns?: number;
  usage?: StreamJsonUsage;
  content_block?: {
    type: string;
    text?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
}

export function parseLog(rawLog: string): LogEntry[] {
  const entries: LogEntry[] = [];
  const lines = rawLog.split("\n");

  let inHeader = false;
  let headerLines: string[] = [];
  let finalResultText: string | null = null;

  // First pass: find the final result text to avoid duplicates
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") continue;
    try {
      const data = JSON.parse(trimmed) as StreamJsonMessage;
      if (data.type === "result" && data.result) {
        finalResultText = data.result;
      }
    } catch {
      // ignore
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle header section (--- delimited)
    if (trimmed === "---") {
      if (inHeader) {
        // End of header - skip, we show this info in the panel header
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
      const entry = parseJsonEntry(data, finalResultText);
      if (entry) {
        entries.push(entry);
      }
    } catch {
      // Not JSON - skip non-JSON lines (usually artifacts)
    }
  }

  return entries;
}

function parseJsonEntry(data: StreamJsonMessage, finalResultText: string | null): LogEntry | null {
  // Skip init messages
  if (data.type === "system" && data.subtype === "init") {
    return null;
  }

  // Handle content_block streaming format
  if (data.type === "content_block_start" && data.content_block) {
    const block = data.content_block;
    if (block.type === "tool_use" && block.name) {
      return {
        type: "tool_call",
        content: block.name,
        toolName: block.name,
        toolInput: block.input ? formatToolInput(block.name, block.input) : undefined,
      };
    }
  }

  // Assistant message with text or tool use
  if (data.type === "assistant" && data.message?.content) {
    for (const block of data.message.content) {
      if (block.type === "text" && block.text) {
        // Skip if this text is the same as the final result (avoid duplication)
        if (finalResultText && block.text === finalResultText) {
          return null;
        }
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

  // Tool result (message.content array with tool_result blocks)
  if (data.type === "user" && data.message?.content) {
    for (const block of data.message.content) {
      if (block.type === "tool_result" && block.content !== undefined) {
        let content: string;
        if (typeof block.content === "string") {
          content = block.content;
        } else if (Array.isArray(block.content)) {
          content = block.content
            .filter((c) => c.type === "text" && c.text)
            .map((c) => c.text)
            .join("\n");
        } else {
          content = "";
        }
        return {
          type: "tool_result",
          content: content,
          isError: false,
        };
      }
    }
  }

  // Final result
  if (data.type === "result") {
    const usage = data.usage || {};
    return {
      type: "result",
      content: data.result || "Task completed",
      stats: {
        duration_ms: data.duration_ms || 0,
        total_cost_usd: data.total_cost_usd || 0,
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cache_read_tokens: usage.cache_read_input_tokens || 0,
        cache_creation_tokens: usage.cache_creation_input_tokens || 0,
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

export function formatTokens(stats: NonNullable<LogEntry["stats"]>): string {
  const totalInput = stats.input_tokens + stats.cache_read_tokens + stats.cache_creation_tokens;

  if (stats.cache_read_tokens > 0 || stats.cache_creation_tokens > 0) {
    const parts: string[] = [];
    if (stats.input_tokens > 0) parts.push(`${stats.input_tokens.toLocaleString()} new`);
    if (stats.cache_read_tokens > 0) parts.push(`${stats.cache_read_tokens.toLocaleString()} cached`);
    return `${totalInput.toLocaleString()} in (${parts.join(", ")}) / ${stats.output_tokens.toLocaleString()} out`;
  }

  return `${totalInput.toLocaleString()} in / ${stats.output_tokens.toLocaleString()} out`;
}
