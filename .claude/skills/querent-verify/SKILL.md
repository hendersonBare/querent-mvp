---
name: querent-verify
description: Independent verification checklist for a Querent v3 task. Runs typecheck, unit tests, build, and Playwright; walks the UI in a browser against docs/design; and records PASS/FAIL with evidence as a comment on the PR. Use when verifying a Querent task or PR, or when running as the verifier agent.
---

# Querent v3 verification

You judge someone else's work in a fresh context. Be skeptical, be concrete, and report exactly what you saw. **Never fix the code yourself.** Report findings; a fix agent fixes them.

## Inputs

You need the task ID, its section in `docs/plans/plan.md`, the branch, the worktree, and the PR number. Read that section (Scope, Files, Tests first, Acceptance), the spec sections it cites in `docs/plans/spec.md`, `docs/plans/decision-log.md` (it wins over everything), and `docs/design/README.md`.

## Checklist

1. **Check out the branch.** Use the task's worktree, or a clean worktree of the branch, at the PR's head commit. Run `npm ci` if `node_modules` is missing, then `npm run db:reset`.
2. **Static checks.** `npm run typecheck`, `npm test`, `npm run build`. Every one must pass.
3. **Unit test quality.** Do the tests cover the task's "Tests first" list, its acceptance criteria and edge cases? Were they written first (the PR shows them failing before the change)? Business-rule tasks need edge-case tests: pricing, floors, freight, money rounding, quote states, roles. Missing tests are a FAIL.
4. **E2E.** After `npm run build`, run the Playwright specs against a production server on a free port with its own database: `QUERENT_WEBSERVER=1 QUERENT_BASE_URL=http://127.0.0.1:31xx DATABASE_PATH=/tmp/<task-id>-e2e.sqlite npx playwright test <specs>` (Playwright reseeds and starts the server). Run every spec the task added or touched, and the existing specs of any screen it changed.
   - UI tasks must have their own spec.
   - No `test.skip`, `test.fixme` or `test.only` (a guard test fails on them).
5. **UI walkthrough** (for any task with UI):
   - If browser-pane tools (`mcp__Claude_Browser__*`) are available, open the running app and walk the task's flow as each persona it touches. Otherwise use a Playwright script that takes screenshots, and view them with Read.
   - Open the matching reference in `docs/design/screens/`, or open `docs/design/querent-quote-flow.html` in the browser, and compare layout, hierarchy, and copy.
   - Differences listed in `docs/design/README.md` are intentional. Anything else is a finding.
   - Check 390px width for customer screens, quote detail, and dialogs.
   - Check specifically:
     - confirm dialogs are centered, with a **red Cancel** and a **Querent-green Send**
     - the red floor warning sits above the price field
     - the Customer PDF never shows cost or margin
     - nothing sends while send-blockers exist
6. **Scope check.** Did the diff do what the task asked and nothing surprising? Is any SQL outside `src/server/repository/` (migrations aside)? Does customer-facing code touch cost or margin? Is deferred work marked `TODO(R-n)` with a registry ID? Is anything cut from the task or the decision log without being flagged? Does it build anything the decision log says is out of scope?

## Verdict

- **PASS** only if every item holds. Anything short of that is a **FAIL**, listing each finding with file:line or screenshot evidence and the expected behavior.
- Record the verdict **only as a comment on the PR** (`mcp__github__add_issue_comment`, or `gh pr comment <n>` where `gh` works): the verdict on the first line (`PASS` or `FAIL`), the head commit verified, each command run and its result, the screenshots taken, and the findings. Edit no other file.
- Return the verdict and the findings to the orchestrator. Do not merge. The orchestrator merges.
