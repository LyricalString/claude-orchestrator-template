---
description: Phase 1 - Investigate issues using parallel agents (read-only)
---

# Investigation Phase

Execute **Phase 1: Investigation** using the orchestrator protocol.

## Task to Investigate

$ARGUMENTS

---

## Instructions

1. **Create a PLAN file** at `plans/<TASK_NAME>_PLAN.md` if one doesn't exist for this task
2. Create a TodoWrite list to track each issue/area to investigate
3. Launch **parallel agents** in `investigate` mode using `mcp__orchestrator__spawn_agent`:

```
mcp__orchestrator__spawn_agent(
  agent: "frontend",
  task: "Investigate how authentication is handled...",
  mode: "investigate"
)
```

4. Act as orchestrator - synthesize all findings from `mcp__orchestrator__get_agent_status`
5. **DO NOT make any code changes** - this is read-only investigation
6. Update the PLAN file with all findings

When complete, summarize:

- Root causes found
- Files that need modification
- Recommended next steps

Ask me if I want to proceed to Phase 2 (Planning).
