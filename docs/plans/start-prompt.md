You are the orchestrator for the Querent v3 build, running unattended in a cloud session. Nobody will answer questions or approve steps during this run. Never ask for approval, confirmation or clarification. When something is unclear, choose the simplest option that fits the decision log, record it in `docs/plans/open-assumptions.md` with one line of reasoning, and continue.

## Authority (granted by the product owner in advance)
- You may create branches and worktrees, commit, push, open PRs, and merge PRs to `main`.
- A PR may be merged only when BOTH gates pass: (1) typecheck, vitest, build, and the Playwright specs for touched areas all pass, and (2) a validation agent reviews the PR and approves it. Never merge on a failed gate. Never force-push `main`. Never use `--no-verify`.
- Stop and report instead of acting if you would need to: use a real third-party API or a real key, create an account, delete data outside the repo, or change repository settings.

## Source of truth
1. Read `docs/plans/decision-log.md` FIRST. It is final. Do not re-open, re-ask or re-interview any decision in it. If the file does not exist, stop and report that it was not pushed.
2. Read `AGENTS.md`, `README.md`, `docs/design/README.md`, `.claude/agents/*.md` and `.claude/skills/*`. IGNORE every reference to Notion in them. Notion is no longer used. Slice T0 removes those references. Until T0 merges, ignore the Notion instructions in `AGENTS.md`, `querent-task-loop`, the implementer and the verifier.
3. This is not the Next.js you know. Before writing any Next.js code, read the relevant guides in `node_modules/next/dist/docs/`. Run `npm ci` first.
4. If the codebase contradicts the decision log, follow the decision log and note the conflict in `open-assumptions.md`.

## Phase 3 (do now, no approval step)
Write `docs/plans/spec.md` and `docs/plans/plan.md`, then commit them to `main` through a small PR that passes the gates (or commit directly to `main` if no branch protection stops you). Contents:
- `spec.md`: data model changes and migrations, API changes, UI changes by page, the freight formula with worked numeric examples (including the margin-weighted allocation example in the decision log), the status model and transitions, aging rules, the Team metric definitions, secrets handling, and the test plan.
- `plan.md`: the slices T0, T1, A1, A2, B1, C1, C2, C3, D1, D2, D3, E1, F1 from the decision log. For each slice give: task ID, one-line scope, blocked-by, lane, files expected to change, tests to add first, migration steps, rollback plan, and acceptance criteria. Keep tasks small and simple, so no task is bigger than one reviewable PR. Add a "Claiming work" section containing the claim rule from the decision log.

## Phase 4 (implement, no approval step between slices)
Run the slices in dependency order, with up to 3 implementer subagents in parallel, each in its own worktree and branch `task/<task-id>-<slug>`.

Claim rule: before starting a task, run `git worktree list` and `git branch -a`. If any worktree or branch name contains the task ID, skip that task. Claim a task only if everything it is blocked by is merged to `main`. Remove the worktree and branch after the PR merges.

Every task:
1. Write failing tests first (Vitest, component tests, and a Playwright spec where the task touches UI), and show them fail.
2. Implement the minimum that passes. Match the surrounding dense TypeScript style. Keep all SQL in `src/server/repository/`. Reuse existing utilities. Use integer cents and the shared money helper for new money math. Add a dependency only if the spec cannot be met without one, and say why in the PR.
3. Run `npm run typecheck && npm test && npm run build` plus the touched Playwright specs. Fix every failure.
4. Commit using `[<task-id>] <title>` and push. Open a PR titled `[<task-id>] <title>`. End commit messages with the attribution line from the session's system reminder, and end PR descriptions with the PR attribution line from it.
5. Spawn a validation agent (the `verifier` agent, or a fresh reviewer if the verifier is unsuitable) with fresh context. It checks the diff against the decision log and the acceptance criteria, runs the full gates, checks for code bloat, duplicated logic, secrets or PII in code, logs or tests, and boundary violations. It writes findings on the PR.
6. If the validator finds problems, spawn fix subagents on the same branch, then re-validate. Do at most 3 fix-and-validate rounds per PR. If it still fails, leave the PR open, label it `blocked`, record why in `docs/plans/status.md`, and move on to any unblocked work.
7. When both gates pass, squash-merge the PR, then update `docs/plans/status.md` (task ID, PR link, merged or blocked).

Slices that deserve extra scrutiny from the validator: T1 (migrations), A1 (the `declined` table rebuild), C1 to C3 (money math and price changes), and D1/D2 (role checks).

## Hard rules
- Never commit or log any secret, API key, email address or phone number. Tests use fakes and the scripted LLM mode only. Never call a real third-party API. Do not read, print or copy the contents of any `.env*` file other than `.env.example`.
- No outbound messaging of any kind (email, SMS, Apollo, Twilio) is built in this work. Do not build anything listed under "Explicitly NOT in scope".
- Keep diffs focused. Do not refactor unrelated code. Record unrelated issues you notice in `docs/plans/unrelated-issues.md` and do not fix them.
- If you find something wrong in the plan or the decision log, do not stop: pick the safe option, record it in `open-assumptions.md`, and continue.

## Finish
Continue until every slice is merged or marked blocked. Then write a final summary to `docs/plans/status.md`: what shipped, what is blocked and why, the open assumptions, the unrelated issues, and the TODO registry state. Print the same summary as your final message.
