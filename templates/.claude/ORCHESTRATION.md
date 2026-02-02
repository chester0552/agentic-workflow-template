# Orchestration Guide

**Project:** {{PROJECT_NAME}}
**Task CLI:** `node tasks/cli.js`

---

## Workflow Overview

This project uses an agentic workflow system with specialized agents, automated task management, and a structured review pipeline.

### User Interface

**Simple Command:** When starting any work session, just say:
```
work on task 5
```

The orchestrator (Claude) will automatically:
1. Get task details from DB
2. Claim the task for the developer agent
3. **Spawn** a developer subagent to implement the task
4. **Spawn** reviewer subagent (consolidated - checks qa/security/pm based on task's reviews field)
5. **Evaluate** review results directly (orchestrator handles decision + CLI)
6. **Loop** if critical issues found (create fix tasks -> developer fix -> re-review -> re-evaluate)
7. Report completion and suggest next task

**The orchestrator never writes code** - all work is done by subagents spawned via the Task tool.

### Core Workflow Loop

```
Single task:                          Multiple tasks (e.g., "work on 7 and 8"):

1. Get + Claim                        1. Get + Claim ALL tasks (parallel Bash calls)
2. Spawn developer                    2. Spawn N developers (ONE message, parallel Task calls)
3. Spawn reviewer                     3. Spawn N reviewers (ONE message, parallel Task calls)
4. Evaluate reviews (orchestrator)    4. Evaluate all reviews (orchestrator, no subagent)
5. Handle decision                    5. Handle each decision independently
   - FAIL -> loop                       - FAIL tasks loop, PASS tasks are done
```

**Parallel execution rules:**
- **Same step, one message** - Batch all subagent spawns for the same step into a single message
- **Wait for ALL before advancing** - All Step 2 developers must return before spawning Step 3 reviewers
- **Loop independently** - If task 7 passes but task 8 fails, report 7 done and loop only 8
- **Label with task ID** - Every Task call description includes the task ID

---

## Subagent Roster

All subagents are spawned via Task tool with `subagent_type: "general-purpose"`.
Each reads its `.md` file from `.claude/agents/` for role and instructions.

| Agent | File | Workflow Step | Role |
|-------|------|---------------|------|
| **developer** | `developer.md` | Step 3 | Writes code per project standards |
| **reviewer** | `reviewer.md` | Step 4 (default) | Consolidated review: checks qa/security/pm in one pass |
| **qa-reviewer** | `qa-reviewer.md` | Step 4 (CRITICAL only) | Separate QA review for maximum thoroughness |
| **security-ops** | `security-ops.md` | Step 4 (CRITICAL only) | Separate security review |
| **project-manager** | `project-manager.md` | Step 4 (CRITICAL only) | Separate requirements review |
| **task-manager** | `task-manager.md` | On demand | Bulk task operations, reorganization, stats |
| **researcher** | `researcher.md` | On demand | Technical research before complex tasks |

---

## Auto-Inference Rules (Step 2)

The orchestrator auto-infers `model`, `reviews`, and `context` at runtime. If the task has explicit values in the DB, use those. Otherwise:

**Model (first match wins):**

| Condition | Model |
|-----------|-------|
| 1 file + description < 100 chars | haiku |
| Title: "Fix:..." or "Follow-up:..." | haiku |
| Priority: CRITICAL or 5+ files affected | opus |
| Everything else | sonnet |

**Review dimensions (additive - each checked independently):**

| Step | Action | Condition |
|------|--------|-----------|
| 0 | Set `none` (skip all) | 1 file affected AND description < 100 chars |
| 1 | Base: `qa` | Always (unless Step 0 matched) |
| 2 | Add `security` | Title/description mentions: {{SECURITY_KEYWORDS}} |
| 3 | Add `pm` | New feature (not Fix:/Follow-up:/test) AND user-visible: page, component, section, layout, design, content, navigation, UX |

**Context files (derived from reviews):**
- `none` -> requirements-summary.md only
- `qa` -> requirements-summary.md, design-system.md
- Any with `security` or `pm` -> all 3

**Persist to DB:** `node tasks/cli.js update <id> --model <inferred> --reviews <inferred>` - creates audit trail.

**`reviews: none`** = skip Step 4 entirely.

### Scoped Fix Reviews

When looping on a fix task (FAIL -> developer fix -> re-review), the reviewer gets **scoped mode**:
- Only verifies the specific issue from the original review was fixed
- Does NOT re-review everything from scratch

### Token Savings

| Approach | Subagents | Context Loads | File Reads |
|----------|-----------|---------------|------------|
| 3 separate reviewers | 3 | 3 | 3x (same files) |
| 1 consolidated reviewer | 1 | 1 | 1x |
| 1 reviewer (qa only) | 1 | 1 (partial) | 1x |

---

## Review Pipeline

### Decision Matrix (Executed by orchestrator directly)

**Classification:**
- "CRITICAL", "FAIL", "Must Fix" -> **FAIL**
- "PASS WITH WARNINGS", "Should Fix" -> **WARNINGS**
- "PASS", "SECURE", "MEETS REQUIREMENTS" -> **PASS**

| Outcome | Orchestrator Action |
|---------|---------------------|
| **FAIL** | Create fix tasks via CLI. Loop: claim fix -> spawn developer -> spawn reviewer -> evaluate again. Repeat until PASS. |
| **PASS** | Complete task via CLI. Report to user. Suggest next task. |
| **PASS_WITH_WARNINGS** | Complete task via CLI + create follow-up tasks. Report to user. |

---

## Task Lifecycle

```
ready -> in_progress -> [review] -> completed
  |                       |
  |                       v
  |                    blocked -> ready (after fixes)
  |
  +-- blocked (external dependency)
```

### Task Fields
- **id**: Auto-generated integer
- **title**: Imperative description
- **priority**: CRITICAL > HIGH > MEDIUM > LOW
- **status**: ready | in_progress | blocked | completed
- **group_name**: A (foundation), B (features), C (polish), D (launch)
- **category**: Development, Testing, Design, Content, SEO, DevOps, Documentation
- **model**: haiku | sonnet | opus (auto-inferred or manual)
- **reviews**: qa | qa,security | qa,pm | qa,security,pm | none (auto-inferred or manual)

---

## Task Management Operations

### Orchestrator CLI Operations (Steps 1-2, 5-6)
- `node tasks/cli.js get <id>` - Read task details
- `node tasks/cli.js claim <id> --agent developer` - Claim tasks
- `node tasks/cli.js complete <id> --summary "..."` - Complete tasks
- `node tasks/cli.js add --title "..." --priority ... --description "..."` - Create fix/follow-up tasks
- `node tasks/cli.js next` - Suggest next task

---

## Shared Context System

All agents use pre-loaded context files from `.claude/context/`:

| File | Purpose | Used By |
|------|---------|---------|
| `project-overview.md` | High-level requirements, tech stack | developer, project-manager, researcher |
| `design-system.md` | Design tokens, component patterns | developer, qa-reviewer |
| `requirements-summary.md` | Acceptance criteria, code standards | all agents |

### Context Optimization Rules
1. Agents read context files first - only read full specs if specific detail needed
2. Load only required context per dimension
3. Total context budget: ~14KB for all context files

---

## Priority Guidelines

| Priority | When to Use | Examples |
|----------|-------------|---------|
| CRITICAL | Blocks all other work | Build system broken, security vulnerability |
| HIGH | Core feature, phase blocker | Key pages, integrations, core setup |
| MEDIUM | Standard feature work | Secondary pages, enhancements |
| LOW | Polish, nice-to-have | Micro-interactions, optimizations |

---

## Group Guidelines

| Group | Phase | Focus |
|-------|-------|-------|
| A | Foundation | Project setup, config, layout, navigation |
| B | Core Features | Primary features, integrations |
| C | Content/Polish | Real content, SEO, accessibility, performance |
| D | Launch | Deploy, domain, testing, monitoring |

---

## Important Rules

1. **Orchestrator never codes** - spawns subagents for ALL work
2. **Task-driven** - All work tracked in task database
3. **Subagent-based execution** - ALL agent work uses Task tool with `subagent_type: "general-purpose"` + custom `.md` file
4. **Review everything** - Never skip the review pipeline
5. **Automated quality loop** - Orchestrator evaluates reviews directly, creates fix tasks and loops if FAIL
6. **Use context files** - Subagents load `.claude/context/` files first
7. **Performance** - Keep code efficient and well-structured
8. **Accessibility** - Follow applicable accessibility standards
9. **Don't over-engineer** - Simple and correct > complex and clever
10. **Trust the loop** - Let the subagent pipeline run
