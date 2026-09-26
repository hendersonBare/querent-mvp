---
name: querent-task-loop
description: Orchestrate the Querent v2 ("Query to Quote") build from the Notion Tasks database. Resumes interrupted work first, claims Ready tasks, runs up to 3 implementer subagents in worktrees, sends each to a verifier, merges on PASS, and keeps Notion current. Use when starting or resuming Querent v2 work, or when the user says "continue the build", "pick up where we left off", or runs /querent-task-loop.
---

# Querent v2 task loop (orchestrator)

You are the **orchestrator**. You schedule, spawn, merge, and keep Notion current. You do **not** write feature code yourself.

## Sources of truth

| What | Where |
|---|---|
| Spec, decisions, and protocol | Notion page **Querent v2: Query to Quote**: https://app.notion.com/p/3e7afa1db504810fbbddc37175014ead |
| Task status (the TODO list) | Notion **Tasks** data source `collection://d430ff73-73c4-45cf-9ad4-e03bec6bd440` |
| Visual reference | `docs/design/` (read `docs/design/README.md` for intentional differences) |
| Code | git, `main` plus `task/<id>-<slug>` branches |

Use the Notion MCP tools (`notion-fetch`, `notion-query-data-sources`, `notion-update-page`, `notion-create-comment`). Their prefixes differ per machine, so load them with ToolSearch (`+notion query`, `+notion update`). Fetch the plan page once at the start of every session and treat it as the spec.

## Identity

Work out who you're running for: `git config user.name` gives Henderson Bare → `henderson`, Sam Greenblatt → `sam`, anyone else → first name, lowercased. *Claimed by* values look like `henderson/impl` or `henderson/verify`. Never touch a task claimed by the other human unless its claim is stale.

## Loop

1. **Sync.** Run `git fetch && git checkout main && git pull`. Query every task, sorted by *Order*.
2. **Resume first.** Collect tasks with Status `Claimed`, `In progress`, `In review`, or `Verify failed` that are either claimed by you, or **stale**: *Claimed at* more than 4 hours ago, with no page edits since.
   - For each one, read its page (TODO checklist, Handoff log, *Handoff notes*) and its branch, then continue it: re-spawn the implementer with the handoff context, or send it to the verifier if it's `In review`.
3. **Pick new work.** A task is **Ready** when:
   - its Status is `Ready`,
   - its Type is not `Review`, since Review tasks belong to humans, and
   - every ID in *Depends on* is `Done`.

   Pick in *Order* sequence until 3 implementers are running. **Phase 0 runs strictly one task at a time.**
4. **Claim** each one before spawning: Status `Claimed`, *Claimed by* `<you>/impl`, *Claimed at* now (datetime), *Branch* `task/<id>-<slug>`.
5. **Spawn implementers** with the Agent tool: `subagent_type: "implementer"`, `isolation: "worktree"`, `run_in_background: true`. The prompt must contain:
   - the task ID, its Notion page URL, and the branch name
   - the claimant string
   - a pointer to the spec page
   - for a resumed task, its latest handoff notes
6. **When an implementer reports back:**
   - If it finished (PR open, Status `In review`), spawn a **verifier** with `subagent_type: "verifier"`, background. Give it the task ID, page URL, PR number, and branch. Set *Claimed by* to `<you>/verify`.
   - If it stopped early (blocked or out of budget), make sure the Handoff notes exist, then re-spawn the implementer on the next loop.
7. **When a verifier reports back:**
   - **PASS and CI green:**
     1. Run `gh pr merge <n> --squash --delete-branch`.
     2. Set Status `Done` and Verification `Pass`.
     3. Pull `main`.
     4. Tell the other running implementers to rebase on `main` before they finish.
   - **FAIL:**
     1. Set Status `Verify failed` and Verification `Fail`.
     2. Spawn an implementer to fix it, with the verifier's findings.
     3. After **2 failed rounds**, set `Blocked` and add a Notion comment tagging Henderson and Sam with the findings.
8. **Repeat** until no task is Ready and nothing is running.
9. **Stopping** (queue empty, a human Phase review is next, or you're low on budget):
   - Make sure every in-flight task has Handoff notes and a pushed branch.
   - Then post a short status summary: what's done, what's waiting on human review, what's blocked.

## Rules

- **Never stop without handoff notes.** Token limits end sessions without warning, so keep Notion current as you go, not at the end.
- **Heartbeat:** update *Claimed at* whenever a task changes state.
- **Phase gates:** a phase's `N.R` review task is for humans. When the only remaining work depends on an open review, stop and tell the user which review is waiting.
- **No deploys:** Railway deployment is manual. Never run it.
- **Schema changes** reseed destructively (bump `SCHEMA_VERSION`). If two branches both bumped the schema, the later one resolves the conflict when it rebases.
- **Conflicts:** tasks that edit the same screen are chained by *Depends on*. If they still conflict, the later task rebases.
- Use the Monitor tool, or just wait for notifications, for background agents. Don't poll.
