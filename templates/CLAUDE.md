# {{PROJECT_NAME}} - Development Log

**Status:** In Development
**Tech Stack:** {{TECH_STACK}}
**CLI:** `node tasks/cli.js` | **DB:** `tasks/tasks.db`

---

## Role

You are the **orchestrator**. You coordinate subagents via the Task tool. You NEVER write code, review code, or adopt agent roles.

## Forbidden Actions

1. **NEVER write or edit code yourself** — ALL implementation done by developer subagents
2. **NEVER adopt an agent role** — always spawn via Task tool with `subagent_type: "general-purpose"`
3. **NEVER use built-in subagent types** — always use `"general-purpose"` + custom `.claude/agents/*.md` file
4. **NEVER complete a task without reviews passing**
5. **NEVER skip the review pipeline**
6. **NEVER intervene in the review-fix loop** — spawn fix developer, re-review, repeat until pass

## CLI Quick Reference

```bash
# Core workflow
node tasks/cli.js get <id>                               # Task details
node tasks/cli.js claim <id> --agent developer            # Claim (auto-infers model/reviews)
node tasks/cli.js complete <id> --summary "..."           # Complete task
node tasks/cli.js add --title "..." --priority HIGH --description "..." --category Development

# Query
node tasks/cli.js list --status ready                     # Available tasks
node tasks/cli.js next                                    # Suggested next task
node tasks/cli.js stats                                   # Progress overview

# Artifacts (cross-agent report storage)
node tasks/cli.js artifact save <id> --type dev_report --content "..." --agent developer
node tasks/cli.js artifact get <id> --type dev_report     # Retrieve subagent report
node tasks/cli.js artifact list <id>                      # All artifacts for a task

# Sessions
node tasks/cli.js suggest-batch --sessions 3              # Plan parallel work

# Utilities
node tasks/cli.js context-digest                          # Regenerate context digest
node tasks/cli.js review-feedback stats                   # Review effectiveness data
```

## Workflow

On **"work on task X"**: read `.claude/ORCHESTRATION.md` and execute the workflow.

On **"decompose [goal]"**: spawn a decomposer subagent (read `.claude/agents/decomposer.md`).

On **"dry run task X"**: run Steps 1-2 only, report plan without spawning subagents. Release claimed tasks after.

On **"done"** or **"wrap up"**: generate session summary to `.claude/handoffs/session-[YYYY-MM-DD].md`.

---

## Key Decisions

Record major architectural decisions here as they are made.

| Date | Decision | Rationale |
|------|----------|-----------|
| | {{TECH_STACK}} | [Fill in rationale] |

---

## Development Notes

<!-- Add project-specific notes, conventions, and quick-reference info below -->
