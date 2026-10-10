<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Querent v3: Query to Quote

Work on this repo is planned and tracked in `docs/plans/`. Those files are the single source of truth:
- `docs/plans/plan.md`: the tasks, their dependencies, and the claim rule. `docs/plans/status.md`: what is in flight, merged, or blocked.
- `docs/plans/spec.md`: the spec. `docs/plans/decision-log.md`: final decisions; it wins over everything else.

- To build or resume, run the `/querent-task-loop` skill as the orchestrator. It claims tasks by worktree and branch (`task/<task-id>-<slug>`) and merges only when every gate passes and the verifier approves.
- Implementer and verifier subagents live in `.claude/agents/`. The verification checklist is `/querent-verify`.
- Visual reference: `docs/design/`. Read `docs/design/README.md` for intentional differences from the mockup.
- Never finish a session with work in flight unless its branch is pushed and `docs/plans/status.md` says where it stands.
