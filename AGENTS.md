<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Querent v2: Query to Quote

Work on this repo is planned and tracked in Notion. It is the single source of truth for the spec and task status:
**Querent HQ → Querent v2: Query to Quote**: https://app.notion.com/p/3e7afa1db504810fbbddc37175014ead

- To build or resume, run the `/querent-task-loop` skill as the orchestrator. It resumes interrupted tasks first (from Notion handoff notes), then claims new ones.
- Implementer and verifier subagents live in `.claude/agents/`. The verification checklist is `/querent-verify`.
- Visual reference: `docs/design/`. Read `docs/design/README.md` for intentional differences from the mockup.
- Never finish a session with work in flight unless the Notion task has *Handoff notes* and the branch is pushed.
