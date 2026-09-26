---
name: querent-verify
description: Independent verification checklist for a Querent v2 task. Runs typecheck, unit tests, build, and Playwright; walks the UI in a browser against docs/design; and records PASS/FAIL with evidence in Notion and on the PR. Use when verifying a Querent v2 task or PR, or when running as the verifier agent.
---

# Querent v2 verification

You judge someone else's work in a fresh context. Be skeptical, be concrete, and report exactly what you saw. **Never fix the code yourself.** Report findings; the implementer fixes them.

## Inputs

You need the task ID, the Notion task page URL, the PR number, and the branch. Read the task page (Scope, Acceptance criteria, TODO), the relevant spec sections on the plan page (https://app.notion.com/p/3e7afa1db504810fbbddc37175014ead), and `docs/design/README.md`.

## Checklist

1. **Check out the branch.** Use `gh pr checkout <n>` in a clean worktree if you can. Run `npm ci` if `node_modules` is missing, then `npm run db:reset`.
2. **Static checks.** `npm run typecheck`, `npm test`, `npm run build`. Every one must pass.
3. **Unit test quality.** Do the tests actually cover the acceptance criteria and edge cases? Business-rule tasks need edge-case tests: pricing, floors, freight, SKU matching, quote states. Missing tests are a FAIL.
4. **E2E.** Start the app on a free port (`PORT=31xx npm run dev`, or `npm run build && PORT=31xx npm start`). Run `QUERENT_BASE_URL=http://127.0.0.1:31xx QUERENT_SCRIPTED=1 npx playwright test`.
   - UI tasks must have their own spec.
   - The task must have removed `test.fixme` from its golden step in `e2e/golden-quote-flow.spec.ts`, and that step must pass.
5. **UI walkthrough** (for any task with UI):
   - If browser-pane tools (`mcp__Claude_Browser__*`) are available, open the running app and walk the task's flow as both personas where relevant. Otherwise use a Playwright script that takes screenshots, and view them with Read.
   - Open the matching reference in `docs/design/screens/`, or open `docs/design/querent-quote-flow.html` in the browser, and compare layout, hierarchy, and copy.
   - Differences listed in `docs/design/README.md` are intentional. Anything else is a finding.
   - Check 390px width for customer screens, quote detail, and dialogs.
   - Check specifically:
     - confirm dialogs are centered, with a **red Cancel** and a **Querent-green Send**
     - the red floor warning sits above the price field
     - the Customer PDF never shows cost or margin
     - nothing sends while send-blockers exist
6. **Scope check.** Did the diff do what the task asked and nothing surprising? Is any SQL outside the repository layer? Is anything cut from the spec without being flagged?

## Verdict

- **PASS** only if every item holds. Anything short of that is a **FAIL**, listing each finding with file:line or screenshot evidence and the expected behavior.
- Update the Notion task:
  - *Verification* = `Pass` or `Fail`
  - append a dated entry to the page's **Handoff log**: the verdict, the commands run and their results, the screenshots taken, and the findings
- Comment the same summary on the PR (`gh pr comment`).
- Return the verdict and the findings to the orchestrator. Do not merge. The orchestrator merges.
