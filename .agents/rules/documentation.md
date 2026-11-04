# Documentation rules

Product docs = MDX under `docs/`, rendered by `apps/docs` (Fumadocs). `docs/docs.json` is the nav, `docs/AGENTS.md` the authoring style. Repo setup in `README.md`.

**Update in same task** when a change touches: features, UI flows, CLI or MCP behavior, connection setup, drivers, security, connection-string handling, public APIs, auth, billing, plans, account settings. That includes small things a page quotes: a button or menu label, a shortcut, a limit or quota, a default, a URL. Before finishing, grep `docs/` for the old label or value. Renamed/removed user-visible concepts → terminology updated **everywhere**. Register new MDX pages in `docs/docs.json`.

**Skip** for internal refactors with no user-visible change, tests, tooling, CI, dev-only scripts, typos in comments/private types. Don't create or expand docs for code-only-scoped work unless asked.

## Release notes

The ToDesktop webhook prepares GitHub release drafts with AI-written user-facing highlights and the original GitHub notes in a collapsed technical changelog. AI failure keeps the original notes so it cannot block a release. The website renders the same body; Discord receives only the highlights because its Markdown does not render HTML details. Publication remains manual. A draft gets its git tag only when published, so its notes cover everything since the last published version: publish drafts in version order or they repeat each other's changes.
