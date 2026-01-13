# AGENTS.md

Guidelines for AI coding agents working in this project.

## Build/Lint/Test Commands

### Package Manager

- **ALWAYS** use `bun` (not npm/yarn)
- **ALWAYS** use `bunx` instead of `npx`

### Running Tests

```bash
# All tests
bun test

# Specific directory tests
cd apps/web && bun test

# Single test file
bun test path/to/file.test.ts
bunx jest --testPathPattern="filename"

# Watch mode
bunx jest --watch
```

### Linting & Type Checking

```bash
# Lint all packages
bun lint

# Type check
bun run type-check    # runs tsc --noEmit --incremental

# Format
bun format
```

### Building

```bash
bun build             # Build all packages
bun clean             # Clean build artifacts
```

## Code Style Guidelines

### TypeScript Conventions

- Use TypeScript for all code
- Prefer `interface` over `type` for object shapes
- Avoid enums; use literal types or maps instead
- Use Zod for runtime validation and type inference

```typescript
// Preferred: interface for object shapes
interface UserProps {
  id: string;
  name: string;
  status: 'active' | 'inactive'; // literal union, not enum
}

// Use Zod for validation
import { z } from 'zod';
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});
type User = z.infer<typeof userSchema>;
```

### Naming Conventions

- **Variables**: camelCase with auxiliary verbs (`isLoading`, `hasError`, `canSubmit`)
- **Components**: PascalCase (`UserProfile`, `EventCard`)
- **Directories**: lowercase with dashes (`auth-wizard`, `user-profile`)
- **Files**: Match export name (`UserProfile.tsx`, `useAuth.ts`)
- **Test files**: `*.test.ts` in `__tests__/` or alongside source

### Import Ordering

1. Framework imports (React, Next.js)
2. Third-party packages (alphabetical)
3. Workspace packages (`@myapp/*`)
4. Relative imports (`@/` alias or `../`)

```typescript
import { useState, useCallback } from 'react';
import { NextRequest, NextResponse } from 'next/server';

import { clerkMiddleware } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

import type { User, Event } from '@myapp/shared-types';
import { getStripeClient } from '@myapp/stripe-utils/server';

import { supabaseAdmin } from '@/lib/supabase-admin';
```

### Component Patterns

- Use functional components with `React.memo` for presentation components
- Separate container (data/logic) from presentation (UI) components
- Extract complex logic into custom hooks
- Use `useCallback` for event handlers, `useMemo` for expensive computations

```typescript
// Container component
const UserListContainer = () => {
  const { data, isLoading } = useUsersQuery();
  const handleSelect = useCallback((id: string) => { /* ... */ }, []);
  return <UserList users={data} onSelect={handleSelect} isLoading={isLoading} />;
};

// Presentation component
const UserList = React.memo(({ users, onSelect, isLoading }: UserListProps) => {
  if (isLoading) return <Skeleton />;
  return <FlatList data={users} /* ... */ />;
});
```

### State Management Hierarchy

1. **Server state**: TanStack React Query (not useState + useEffect)
2. **Global state**: Zustand stores in `packages/`
3. **Derived state**: `useMemo` (not useState)
4. **Local UI state**: `useState` only for toggles, inputs, modals

```typescript
// Derived state (preferred)
const filteredItems = useMemo(() => items.filter((i) => i.active), [items]);

// NOT this
const [filteredItems, setFilteredItems] = useState([]);
useEffect(() => setFilteredItems(items.filter((i) => i.active)), [items]);
```

### Error Handling

- Handle errors at the beginning of functions (early returns)
- Use guard clauses for preconditions
- Implement proper error logging with user-friendly messages

```typescript
async function processUser(userId: string) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const user = await getUser(userId);
  if (!user) {
    return { error: 'User not found' };
  }

  // Main logic...
}
```

### Formatting (Prettier/Biome)

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

## Shared Packages

Import from workspace packages, not duplicating code:

```typescript
// Types and constants
import type { User, Event } from '@myapp/shared-types';
import { CONSTANTS } from '@myapp/shared-types';

// Validation schemas
import { userSchema } from '@myapp/validation-schemas';

// Stripe (server-side only)
import { getStripeClient } from '@myapp/stripe-utils/server';

// Supabase
import { useAuthenticatedClient } from '@myapp/supabase-client';
```

## Authentication Patterns

### Web Apps (Clerk + Supabase)

```typescript
// API routes: use auth() not currentUser() when middleware is present
import { auth } from '@clerk/nextjs/server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });
  // ...
}
```

### Alternative: Supabase Native Auth

```typescript
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  // ...
}
```

## Database Migrations

Location: `supabase/migrations/`

```bash
# Create a new migration (uses timestamp format automatically)
supabase migration new <migration_name>

# Test locally first
supabase db reset

# Check migration status (local vs remote)
supabase migration list --linked

# Check diff with production
supabase db diff --linked

# Push to production (careful!)
supabase db push
```

### Migration Naming

- **Use timestamps, not sequential numbers** - Run `supabase migration new <name>` to create migrations
- Format: `YYYYMMDDHHMMSS_description.sql` (e.g., `20260102115000_add_user_roles.sql`)
- This prevents naming conflicts when multiple developers create migrations

### Migration Rules

- Keep migrations simple (avoid complex triggers)
- Use soft delete (`deleted_at`) for financial/audit records
- Document intent with SQL comments
- Use `auth.jwt()->>'sub'` for Clerk user ID in RLS policies (not `auth.uid()` - that's for Supabase native auth)

## Orchestrator Workflow

For complex tasks (client feedback, multi-issue bugs, large features), use the orchestrator workflow with MCP tools.

### Quick Start Commands

```bash
/client-feedback "paste feedback here"  # Full workflow
/investigate "task description"          # Phase 1 only
/plan-fix                                # Phase 2 only
/implement                               # Phase 3 only
/continue-plan PLAN_FILE.md              # Resume from PLAN file
```

### The Three Phases

1. **Investigation** - Parallel agents in `investigate` mode, read-only, create PLAN file
2. **Planning** - Review against patterns, update PLAN, get approval
3. **Implementation** - Parallel/sequential agents in `implement` mode, type-check at end

### MCP Orchestrator Tools

The orchestrator uses an MCP server to spawn and manage subagents:

| Tool | Purpose |
| ---- | ------- |
| `mcp__orchestrator__spawn_agent` | Launch a subagent with a specific task |
| `mcp__orchestrator__get_agent_status` | Check agent status (use log tools for output) |
| `mcp__orchestrator__list_agents` | List all available and spawned agents |
| `mcp__orchestrator__kill_agent` | Terminate a running agent |
| `mcp__orchestrator__read_agent_log` | Read agent logs with optional `offset`, `limit`, `tail` params |
| `mcp__orchestrator__search_agent_logs` | Search logs with regex pattern and optional context lines |

### PLAN File

Always maintain a PLAN markdown file (e.g., `.claude/plans/FEATURE_PLAN.md`) as the single source of truth:

- Create at start, update throughout
- Contains: issues, findings, implementation steps, progress log
- If you leave, return with `/continue-plan PLAN_FILE.md`

See `.claude/agents/orchestrator.md` for full protocol.

---

## Agent & Documentation Maintenance

### Keep Agent Definitions Updated

Agent definition files (`.claude/agents/*.md`) must stay in sync with the codebase. **After completing significant changes**, update the relevant agent file if:

- Package versions changed (check `package.json`)
- Directory structure changed
- New patterns were introduced
- Key files were added/removed/renamed
- New shared packages were added

**Trigger phrases** that should prompt an agent update:

- "I upgraded [package] to version X"
- "I restructured the [folder]"
- "I added a new pattern for [X]"
- "I created a new shared package"

### Keep AGENTS.md Updated

This file should be updated when:

- New commands are added to the workflow
- New shared packages are created
- Authentication patterns change
- New code conventions are adopted

### Generate New Agents

Use the `/generate-agent` command to create a new agent definition:

```bash
/generate-agent apps/new-app        # For an app
/generate-agent packages/new-pkg    # For a package
```

This will analyze the directory and generate a complete agent definition.

---

## Critical Reminders

1. **Never** expose service role keys in client code
2. **Always** use authenticated Supabase clients for admin operations
3. **Always** test RLS policies locally before deploying
4. **Always** use React Query for data fetching (not useEffect)
5. **Always** validate with Zod schemas from shared packages
6. **Always** update agent definitions after significant architectural changes
