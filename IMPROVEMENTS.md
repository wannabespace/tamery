# Improvements

Backlog of product improvements, ranked by uniqueness vs effort. **Every future improvement idea goes in this file** — append it to the matching section (or a new one) instead of leaving it in chat, a PR description, or a scratch doc. Remove an entry when it ships or gets rejected.

The backlog below was moved into GitHub issues (`label:enhancement`) on 2026-10-26; this file now holds new ideas until they are ticketed, plus what we've decided not to do. Add a new idea here, and ticket it when it's ready to work.

Suggested order: #628 (Schema notes) → #624 (Agent chat) → #626 (Impact preview) → #625 (MCP) — schema notes improve every AI feature at once, the agent reuses drafts, impact preview makes the agent safe, and MCP exposes the same safe tools to outside agents.

## Tracked in GitHub

Ranked features (each its own ticket):

- #624 — Agent chat where every AI write is a reviewable draft
- #625 — MCP beyond the desktop server
- #626 — Impact preview before a destructive run
- #627 — Undo for applied changes
- #628 — Schema notes (semantic layer)
- #629 — Explain plan plus "why is this slow"
- #630 — Schema diff between connections
- #631 — Migrations: applied/pending + drift, migrator-agnostic
- #632 — Auto-charts on results
- #633 — PII masking

By area (each ticket bundles that area's items as a checklist):

- #634 — Table & grid
- #635 — Query runner
- #636 — Offline writes
- #637 — Sign-in
- #638 — Connections
- #639 — Settings
- #640 — SSH tunnels
- #641 — Connection form
- #642 — Desktop app
- #643 — Developer experience
- #644 — AI
- #645 — Website
- #646 — Keyboard & shortcuts
- #647 — Sharing
- #648 — Security

## Deferred

- **Notebooks / dashboards** — a different product; saved queries plus auto-charts cover most of it.
- **More engines** (Mongo icon exists) — no differentiation, each costs dialect work. `toMongoPipeline` already runs filters through a reference (`via`), but Mongo has no foreign keys to offer the targets: references would have to be inferred (ObjectId fields found in another collection) or declared by the user.
- **Team features** — blocked until multi-member workspaces exist.
