# CLAUDE.md — ZINC-FUSION-V16

**All project rules, hard rules, tech stack, phases, and architecture decisions live in
[`AGENTS.md`](AGENTS.md).** Read it before doing anything.

**Active work plan & gotchas:** [`docs/plans/2026-05-17-dashboard-revised-work-plan.md`](docs/plans/2026-05-17-dashboard-revised-work-plan.md) and [`/memories/repo/dashboard-plan-and-gotchas.md`](/memories/repo/dashboard-plan-and-gotchas.md). ALWAYS read these after AGENTS.md.

---

## First Session Setup — Claude Code Only

### 1. Install Claude Code Plugins

Install in this order — process skills first, then domain skills:

```bash
# TIER 1: Process Skills (install these FIRST — they govern HOW you work)
/install-plugin superpowers
# Gives you: brainstorming, TDD, debugging, code review, writing-plans, verification

# TIER 2: Code Quality (install before writing any code)
/install-plugin pr-review-toolkit
/install-plugin code-simplifier
/install-plugin commit-commands

# TIER 3: Stack-Specific (install when you start building)
/install-plugin vercel          # Deployment, logs, env management
/install-plugin frontend-design # UI components, design system

# TIER 4: Optional but Useful
/install-plugin playwright      # Browser testing (useful for ProFarmer scraper testing)
```

**Why this order matters:** Superpowers enforces brainstorming before coding, TDD before implementation, and verification before claiming done. Without it, agents tend to cowboy — especially on a fresh repo where there's no existing code to constrain them.

### 2. Configure MCP Servers

These MCP servers should be active for this workspace:

| Server                      | Purpose                                                      | Required? |
| --------------------------- | ------------------------------------------------------------ | --------- |
| `memory`                    | Knowledge graph — persist decisions across sessions          | **Yes**   |
| `sequentialthinking`        | Structured problem-solving for multi-step tasks              | **Yes**   |
| `context7`                  | Up-to-date library docs (Supabase, Next.js, shadcn)          | **Yes**   |
| `supabase`                  | Direct Supabase management (migrations, SQL, edge functions) | **Yes**   |
| `puppeteer` or `playwright` | Browser automation (ProFarmer testing)                       | Later     |

**Memory API Contract:** Use graph API tools (`search_nodes`, `create_entities`, `add_observations`, `read_graph`). NOT simple-memory tools (`search_memory`, `list_memories`). If the wrong tools appear, fix the MCP config before proceeding.

### 3. Read The Migration Plan

Before writing ANY code, read the full migration plan:

```
docs/plans/2026-03-17-v16-migration-plan.md
```

Pay special attention to Sections 4, 5, 10, and 11.

### 4. Understand the Legacy Baseline Reference

legacy baseline lives at a separate path (likely `/Volumes/Satechi Hub/ZINC-FUSION-legacy baseline/` or wherever the user has it). It is a **reference library**, not a source of code. You study it for:

- What the chart looks like and how it behaves
- What data contracts the API routes serve
- What the landing page design looks like
- What the Vegas Intel page contains
- How specialists generate signals

You do NOT:

- Copy files from legacy baseline
- Import legacy baseline modules
- Reuse legacy baseline's Prisma migrations
- Carry over legacy baseline's `.env` files
- Port legacy baseline's Inngest functions
