---
description: Phase 3 - Execute implementation plan with coordinated agents
---

# Implementation Phase

Execute **Phase 3: Implementation** using the orchestrator protocol.

## Context

$ARGUMENTS

---

## Instructions

1. **Read the PLAN file** to understand the implementation plan
2. Identify tasks that can run in parallel vs sequentially
3. Launch agents in `implement` mode using `mcp__orchestrator__spawn_agent`:

```
mcp__orchestrator__spawn_agent(
  agent: "frontend",
  task: "Implement the login button changes described in the plan...",
  mode: "implement"
)
```

4. **Parallel execution**: Launch independent tasks together
5. **Sequential execution**: Wait for dependent tasks to complete first
6. Inform parallel agents in their task description:
   - They're part of a team working concurrently
   - Type errors might be from other agents
   - Focus only on their assigned files
   - Don't run type-check themselves
7. **Update PLAN file progress** after each major completion
8. Run `bun run type-check` after ALL agents complete (check with `mcp__orchestrator__get_agent_status`)
9. Fix any type errors
10. Mark PLAN file as complete

Type-check must succeed. Linter errors can be deferred.
