# Improvements

Backlog of product improvements, ranked by uniqueness vs effort. **Every future improvement idea goes in this file** — append it to the matching section (or a new one) instead of leaving it in chat, a PR description, or a scratch doc. Remove an entry when it ships or gets rejected.

The earlier backlog was moved into GitHub issues (`label:enhancement`) on 2026-10-26; this file now holds new ideas until they're ticketed, plus what we've decided not to do.

Suggested starting order: Schema notes → Agent chat → Impact preview → MCP — schema notes improve every AI feature at once, the agent reuses drafts, impact preview makes the agent safe, and MCP exposes the same safe tools to outside agents.

## Deferred

- **Notebooks / dashboards** — a different product; saved queries plus auto-charts cover most of it.
- **More engines** (Mongo icon exists) — no differentiation, each costs dialect work. `toMongoPipeline` already runs filters through a reference (`via`), but Mongo has no foreign keys to offer the targets: references would have to be inferred (ObjectId fields found in another collection) or declared by the user.
- **Team features** — blocked until multi-member workspaces exist.
