# Documentation rules

Product docs = MDX under `docs/`, rendered by `apps/docs` (Fumadocs). `docs/docs.json` is the nav, `docs/AGENTS.md` the authoring style. Repo setup in `README.md`.

**Update in same task** when a change touches: features, UI flows, CLI or MCP behavior, connection setup, drivers, security, connection-string handling, public APIs, auth, billing, plans, account settings. That includes small things a page quotes: a button or menu label, a shortcut, a limit or quota, a default, a URL. Before finishing, grep `docs/` for the old label or value. Renamed/removed user-visible concepts → terminology updated **everywhere**. Register new MDX pages in `docs/docs.json`.

**Skip** for internal refactors with no user-visible change, tests, tooling, CI, dev-only scripts, typos in comments/private types. Don't create or expand docs for code-only-scoped work unless asked.

## Release notes

The ToDesktop webhook prepares GitHub release drafts with AI-written user-facing highlights only. AI failure keeps the original notes so it cannot block a release. The website and Discord render the same body. Publication remains manual. A draft gets its git tag only when published, so its notes cover everything since the last published version: publish drafts in version order or they repeat each other's changes.

**A version's what's-new card comes from its release.** The app asks the API for the published release tagged `v<its version>` and shows a card in the Navigator only when that release's body holds an image: the first image (Markdown or the `<img>` GitHub inserts on drop) is the card's picture and the first prose paragraph, the AI summary, its one line. To announce a version, drop a 16:9 picture (1600×900, a close-up of the feature, since the card shows it about 250px wide) at the top of the draft before publishing; a release without one shows no card. Each user sees a version's card until they open or dismiss it, per device.
