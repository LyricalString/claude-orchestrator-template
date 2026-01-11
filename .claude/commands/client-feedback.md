---
description: Process client feedback with full orchestrated workflow (investigate, plan, implement)
---

# Client Feedback Workflow

Process the following client feedback using the orchestrator protocol.

## Client Feedback

$ARGUMENTS

---

## Instructions

Follow the orchestrator workflow protocol:

1. **Create a PLAN file** at `.claude/plans/FEEDBACK_PLAN.md` to track this task
2. **Phase 1: Investigation** - Launch parallel agents in investigate mode using `mcp__orchestrator__spawn_agent`
3. **Phase 2: Planning** - Create detailed implementation plan aligned with codebase patterns
4. **Phase 3: Implementation** - Execute with coordinated agents in implement mode

### How to Launch Agents

Use the MCP orchestrator tools:

```
mcp__orchestrator__spawn_agent(
  agent: "frontend",
  task: "Investigate the login component...",
  mode: "investigate"
)
```

Available agents are defined in `.claude/agents/`. Check `mcp__orchestrator__list_agents` for available agents.

Keep the PLAN file updated throughout. If I need to leave, I should be able to return and say "continue from FEEDBACK_PLAN.md".

Start with Phase 1 now.
