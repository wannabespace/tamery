# Monorepo map and dev commands

## Where code goes

`ls apps packages` for the list. Non-obvious placements:

- `apps/app/src/modules`, `apps/main/src/modules` — one folder per feature; `apps/app/src/core` — one folder per shared domain. Rules in `architecture.md` → Modules, Core layout.
- `apps/proxy` — separate Hono process executing DB queries; clients connect to **the proxy**, not `apps/api`. `packages/query-proxy` holds the oRPC router factory both share.
- `packages/sql` — the SQL language behind the editor: per-dialect tokenizer (also Monaco's tokens provider), statement splitter, catalog-aware diagnostics and completion, destructive-keyword check. Pure and Monaco-free; `packages/monaco` is the only place that binds it to Monaco.
- `packages/mongo` — the mongosh language, as `packages/sql` is SQL's: the `db` call parser the executor runs and the checks classify, the method tables, statement splitting, completion, the Extended JSON ⇄ shell writer and the grid's value conversion. Pure and Monaco-free; `packages/monaco` binds it as the `mongodb` language.
- `packages/monaco` — everything Monaco: the `Monaco` component with its themes and workers, `monaco.css`, and the SQL language binding. It knows nothing about the app's data: an editor's model is bound to a `SqlSource` (catalog, column loading, AI completion, change feed), which the app builds from its query cache in `core/sql-editor/sql-source.ts` — `attachSqlSource` plus `SQL_COMPLETION_OPTIONS` (`@tamery/monaco/sql-language`) give any SQL editor the runner's completion.
- `packages/connection` — driver wrappers and the `executors` map over them, connection-string parsers, SSL/SSH utils, and everything a statement needs before an executor runs it: the per-engine Kysely dialects and query compilers, `selectPage` and the filter value bindings, which the app and the proxy's share reads both compile with. **No Drizzle** (that is `packages/db`, cloud PostgreSQL only).
- `packages/ai` — everything AI that needs no db/auth/oRPC: models, resumable chat stream, `UIMessage` helpers, one module per generation feature. New prompts and models go here, not `apps/api`. Folder barrels only, each re-exporting by name (`code-style.md`), so the client never pulls server-only modules.
- `@tamery/vite-inline-html` — Vite plugins that fill `index.html` markers in dev and build (the root entry inlines bundled IIFE scripts, the `/react` entry server-renders components). The root entry also fills an optional `cspMarker` in the `script-src`: the inlined scripts' `'sha256-…'` in a build so the CSP carries no `'unsafe-inline'`, but `'unsafe-inline'` in dev, where Vite injects the Fast Refresh preamble as an unhashable inline script. It knows nothing about shells, boot or CSS; every target is passed from the app's `vite.config.ts`.
- `apps/share` — the public share site (`share.tamery.app`, TanStack Start like the docs). It holds no data and no secrets: a viewer's rows come through the proxy's public `shares.*` procedures. The password goes from the browser straight to the proxy's `shares.unlock`, never through the site's server, which would give every viewer its address; the site's server only stores the returned token in the cookie. Its owner pages (the share list at `/`) call the API from its server functions with the visitor's own session cookie, which the API sets on `.tamery.app`; signing in happens on the website, whose `/deep/share?path=` sends a signed-in visitor back to a share-site path (never another origin). Dev URL `https://share.local.tamery.app`.
- `apps/desktop` — Electron wrapper around `apps/app`; `apps/main` is marketing + auth only.
- `apps/docs` — documentation site (Fumadocs on TanStack Start). Content stays in the repo-root `docs/` folder; `docs/docs.json` is the nav. Dev URL `https://docs.local.tamery.app`.
- `motion-panels` — the resizable pane mechanics (framework-agnostic core plus a React adapter, animated with motion). An **external npm package** developed in its own repo (`~/Projects/Own/motion-panels`), not a workspace package; the catalog pins the version. To test local changes, add a `pnpm-workspace.yaml` `overrides` entry (`link:` paths resolve from the workspace root; catalogs reject the protocol), `pnpm install`, restart Vite, and rebuild the package for each change — then **drop the override before merging**, or the branch installs a checkout CI does not have. The app imports the kit wrapper (`packages/ui/src/components/custom/resizable.tsx`), never the package; behaviour and rules are in the `tamery-ui` skill.

## Dev commands

Setup lives in `README.md`, the command list in the root `package.json`. Not obvious:

- Feature branches start from `main` and PRs target it. `conar` is the legacy Conar app (conar.app, its own Railway services, same database): only Conar fixes go there, never feature work.
- `pnpm x` picks package + script; `pnpm run dev`'s picker takes `-a` to skip the prompt.
- A dead backend shows up in the browser as a **CORS error**: portless answers for a stopped server with a 502 that has no CORS headers. `bun --watch` stays down after a crash until a watched file changes, and it ignores `node_modules`, so a crash on a not-yet-installed package needs `dev` restarted after `pnpm install`.
- Portless dev URLs live only while `dev` runs. In a linked git worktree portless prefixes the branch name, so worktrees run alongside the main checkout.
- `.env` files are gitignored and created by `scripts/setup-dev.ts` on install, never overwritten. A linked worktree copies them from the main checkout, because `.env.example` points at localhost services that don't run here. To resync a stale `.env`, delete it and re-run `bun scripts/setup-dev.ts`.
- Every icon is generated by `pnpm icons` from the brand images in `brand/` and never edited by hand; a new design replaces the image and the command reruns. The root `icons.config.ts` maps each image to folders and their files (size, corners, zoom). `packages/resize` (`@tamery/resize`, the `resize-images` bin) only renders a config and knows nothing about Tamery. The per-image brand kits written to `brand/<name>/` are gitignored, built on demand.
- Cross-service dev URLs are not in `.env` — `setupPortlessEnvs(...)` fills them at startup, worktree-aware, and each app declares its own env-key map. Precedence: existing env var > portless > declared default.

## Deploys

Every Tamery service on Railway builds from its app's own `apps/<app>/Dockerfile` (the service's Dockerfile Path; the build context is the repo root), which installs only that app's workspace closure. The files repeat their install steps on purpose, so each app's build can change on its own. api and proxy ship the whole build, sources and `node_modules`, and run the app's `start`; app's image holds `dist` behind `serve`; main, docs and share hold Nitro's self-contained `.output`. The dashboard keeps just the Dockerfile Path, the pre-deploy command and the watch paths; Build and Start Command stay empty, since a Start Command overrides the image's `CMD`. Railway runs dashboard commands without a shell (no `cd`, no `&&`) in the image's working directory, the app's folder. Every `pnpm run` stays there or filtered: an unfiltered one at the root makes pnpm's `verifyDepsBeforeRun` install the whole workspace the filter left out. So api's pre-deploy is `pnpm --filter @tamery/db run drizzle:migrate`. Only the `ARG`s a Dockerfile declares reach its build, so a new build-time variable (a `VITE_PUBLIC_*`) gets an `ARG` there. Watch paths are `/*`, `/.dockerignore`, `/packages/**`, the app's folder and every other app it depends on (`pnpm --filter @tamery/<app>... ls --depth -1`; docs also `/docs/**`): all of `packages` costs a needless redeploy now and then but never misses a new dependency.

## Opening the running app in a browser

**`agent-browser`** (`npm install -g agent-browser && agent-browser install`; not an MCP server or a project dependency) opens its own Chrome window and trusts the portless CA, so portless HTTPS hosts load. Dev app: `https://app.local.tamery.app`.

Its profile is **signed out**: anything behind auth needs the user's own Chrome (`mcp__claude-in-chrome__*`), since entering credentials is not an agent's to do. That is also the fallback when a binary is missing or the task needs their real profile. Playwright for scripted multi-step runs.

**The user's Chrome traps** — each one looks like an app bug and is not:

- The MCP tab usually sits behind another window with `visibilityState: hidden`. rAF never runs, so animations and CSS transitions freeze mid-way (computed colours included), rAF-scheduled opens stay shut (base-ui `Combobox.Trigger` on click; `ArrowDown` still opens it), and ⌘-hotkeys do nothing. Check the tab's visibility before calling a control broken.
- It shares localStorage with the user's own tab on the same origin: pane sizes and preferences changed there change theirs. Restore them, close the MCP tab when done, and ask the user to reload.
- A first-time chunk load can make Vite re-optimize deps mid-session and crash the page with `Cannot read properties of null (reading 'useMemoCache')`. That is a dev artifact: navigate to the same URL once and continue.

**The desktop app** is driven through its own isolated Electron instances over CDP, never the user's: the `electron-drive` skill covers launching, signing in, native dialogs and window screenshots.

**A sandboxed/embedded browser pane cannot load portless HTTPS hosts** — every subresource is cancelled with `net::ERR_BLOCKED_BY_CLIENT` by the pane's own request layer (not TLS, CSP or service workers). Bare `http://localhost:<port>` works there.
