---
name: querent-task-loop
description: Orchestrate the Querent v3 build from docs/plans/plan.md. Claims tasks by worktree and branch, runs up to 3 implementer subagents test-first, sends each PR to a verifier, merges only when every gate passes and the verifier approves, and keeps docs/plans/status.md current. Use when starting or resuming Querent work, or when the user says "continue the build", "pick up where we left off", or runs /querent-task-loop.
---

# Querent v3 task loop (orchestrator)

You are the **orchestrator**. You schedule, claim, spawn, merge, and keep `docs/plans/status.md` current. You do **not** write feature code yourself.

## Sources of truth

| What | Where |
|---|---|
| Tasks, dependencies, claim rule | `docs/plans/plan.md` (each task is a `## <task-id>: <title>` section) |
| Task status (in flight, merged, blocked) | `docs/plans/status.md` |
| Spec | `docs/plans/spec.md` |
| Final decisions (win over everything) | `docs/plans/decision-log.md` |
| Visual reference | `docs/design/` (read `docs/design/README.md` for intentional differences) |
| Code | git, `main` plus `task/<task-id>-<slug>` branches |

Read `plan.md` and `status.md` at the start of every session.

## Loop

1. **Sync.** `git fetch --prune && git checkout main && git pull`.
2. **Resume first.** A task `status.md` lists as in progress whose branch still exists, but that no agent of yours is running, is interrupted work: continue it on its existing branch and worktree. Read its commits and open PR, then re-spawn the implementer (no PR yet), the verifier (PR open, not yet verified), or a fix agent (verifier findings open).
3. **Pick new work** in `plan.md` dependency-table order, until 3 agents are running. For each candidate:
   - Run `git worktree list` and `git branch -a`. If any worktree or branch name contains the task ID, skip it: someone has it.
   - Skip it if `status.md` lists it as merged (merged branches are deleted).
   - It is claimable only when every task it is *Blocked by* is merged to `main`.
4. **Claim** by creating its worktree and branch from the latest `main`: `git worktree add ../wt/<task-id> -b task/<task-id>-<slug> origin/main`, then `git push -u origin task/<task-id>-<slug>`. The slug is the task title in kebab case. Record it as in progress in `status.md`.
5. **Spawn an implementer** with the Agent tool: `subagent_type: "implementer"`, `run_in_background: true`, working only in that worktree. The prompt holds the task ID, a pointer to its `plan.md` section, the branch, and the worktree path. Implementers work test-first: failing tests first, shown failing, then the code.
6. **When an implementer reports back** with a PR open, spawn a **verifier** (`subagent_type: "verifier"`, background) with the task ID, the `plan.md` section, the branch, the worktree, and the PR number. If it stopped early, re-spawn it on the same branch with what it reported.
7. **When a verifier reports back**, merge only when BOTH gates hold:
   - the verifier's PR comment says **PASS**, and
   - every test gate passed on the PR's head commit: `npm run typecheck`, `npm test`, `npm run build`, and the touched Playwright specs (plus CI, if it ran).

   Then:
   1. Squash-merge with `mcp__github__merge_pull_request` (`merge_method: "squash"`), or `gh pr merge <n> --squash` where `gh` works.
   2. Pull `main`, record the task as merged (with its PR) in `status.md`, commit and push.
   3. Remove the worktree and branch: `git worktree remove ../wt/<task-id>`, `git branch -D task/<task-id>-<slug>`, `git push origin --delete task/<task-id>-<slug>`.
   4. Tell the other running implementers to rebase on `main` before they finish.

   Otherwise spawn a **fix agent** (`subagent_type: "implementer"`) on the **same branch and worktree** with the verifier's findings and the failing gate output, then verify again. After **3 fix-and-validate rounds** that still fail, add the `blocked` label to the PR, record why in `status.md`, and leave it unmerged.
8. **Repeat** until nothing is claimable and nothing is running.
9. **Stopping** (everything merged or blocked, or you're low on budget): make sure every in-flight branch is pushed and `status.md` says where each task stands, then post a short summary: merged, in flight, blocked and why.

## Rules

- **At most 3 agents at once** (implementers, fix agents and verifiers together).
- **Never stop with work only on disk.** Sessions end without warning, so push branches and keep `status.md` current as you go.
- **Nothing merges on one gate.** A failing test or a verifier FAIL keeps the PR unmerged.
- **No deploys:** Railway deployment is manual. Never run it.
- **Migrations** take the next free number on `main` when the PR is opened; the later branch renumbers when it rebases.
- **Conflicts:** tasks that edit the same files are chained by *Blocked by*. If they still conflict, the later task rebases.
- Use the Monitor tool, or just wait for notifications, for background agents. Don't poll.
