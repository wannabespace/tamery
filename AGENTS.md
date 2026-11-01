# Agent instructions

Guidance for AI coding agents working in this repository. Auto-discovered as `AGENTS.md`; `CLAUDE.md` is a symlink to this file. Edit this file when changing the rules — do not duplicate the content elsewhere.

## Keep this file up to date

This file is the source of truth for Conar's architecture, main logic, and conventions — keep it accurate. Whenever you change something it describes, update it in the same task. Update when you:

- Add, remove, or rename an app or package in the monorepo map
- Change dev commands, ports, or what `docker:start` spins up
- Add or change an architecture constraint (API layer, state, ORM, auth, secrets, runtime, styles)
- Add, remove, or change oRPC middlewares or the router pattern
- Rename or reshape a core domain concept (Connection, SyncType, collections, sync/GC lifecycle)

If a claim here no longer matches the code, fix the claim — do not leave it stale.

## Update documentation when relevant

When you change behavior users rely on, update docs in the same task — do not leave them stale.

**Update when:**

- New or changed features, UI flows, CLI commands, or MCP behavior
- Connection setup, drivers, security, or connection-string handling
- Public APIs, auth, billing, plans, or account settings
- Renamed or removed user-visible concepts (update terminology everywhere)
- New MDX pages: register them in `docs/docs.json`

**Skip when:**

- Internal refactors with no user-visible change
- Tests, tooling, CI, or dev-only scripts
- Typo fixes in code comments or private types

**Where docs live:**

| Area                        | Location         |
| --------------------------- | ---------------- |
| Product docs (Mintlify MDX) | `docs/**/*.mdx`  |
| Doc nav                     | `docs/docs.json` |
| Doc authoring style         | `docs/AGENTS.md` |
| Repo setup / contribution   | `README.md`      |

After implementing a change: search `docs/` for pages covering the affected area, update them, and wire any new pages into `docs/docs.json`. Follow `docs/AGENTS.md` for Mintlify style (MDX frontmatter, active voice, sentence-case headings). Do not create or expand docs for changes the user explicitly scoped as code-only, unless they ask for documentation.

## What Conar is

Conar is an AI-powered desktop/web app for managing database connections. It stores connection metadata and encrypted connection strings locally (SQLite via OPFS) and optionally syncs metadata to the cloud.

## Domain terminology

Use these terms precisely; avoid the listed synonyms.

- **Connection** — a named, typed pointer to a database. Holds metadata (name, label, color, sync type) but not the raw connection string. _Avoid_: database, data source.
- **Connection String** — the full URL (including credentials) used to reach a database. Always stored encrypted; never sent to the cloud in plaintext. _Avoid_: credentials, DSN, URL.
- **SyncType** — controls how a connection's credentials are handled during cloud sync:
  - `Cloud` — metadata + encrypted password both synced to cloud.
  - `CloudWithoutPassword` — metadata synced; password kept local-only. Use when the user wants cross-device access without trusting the cloud with credentials.
  - `Local` — nothing leaves the device.
  - _Avoid_: sync mode, cloud mode.
- **Collections** — client data lives in TanStack DB collections, defined in `apps/app/src/entities/collections/index.ts`. There are six: `connectionsCollection`, `connectionsResourcesCollection`, `connectionStringsCollection`, `chatsCollection`, `chatsMessagesCollection`, `queriesCollection`. All persist to SQLite (OPFS via `@tanstack/browser-db-sqlite-persistence`); the synced ones also stream from the cloud via oRPC event iterators (`syncCollectionOptions` in `~/lib/sync`).
- **Connections Collection** (`connectionsCollection`) — holds `Connection` rows. Backed by SQLite persistence plus a cloud sync stream (`orpc.connections.events` / `orpc.connections.sync`).
- **Connection Strings Collection** (`connectionStringsCollection`) — holds one `ConnectionString` row per `Connection`. Persisted to SQLite, no cloud sync. Populated on demand: `useConnectionStringsSync` runs a `createEffect` whose `onEnter` fires when a `Connection` enters `connectionsCollection`, resolves the string via `connectionStringsCollection.utils.resolve(id)` (cloud, else local decrypt), and inserts/updates the row.
- **Collections lifecycle** — `getCollections()` lazily creates the singleton set of collections and caches it in `current`; `cleanCollections()` drops it (`current = null`). `_protected` route's `beforeLoad` calls `getCollections()` and awaits `stateWhenReady()` for the core collections; `ProtectedLayout` calls `cleanCollections()` on unmount. TanStack DB GCs a collection's in-memory data when `activeSubscribersCount` stays at zero longer than `gcTime` (status becomes `cleaned-up`).

## Monorepo map

```
apps/
  api/       Hono + oRPC backend. Auth, connections, AI, queries, billing.
  app/       React SPA. Main product UI (TanStack Router + TanStack DB).
  main/      Marketing + auth pages (TanStack Start / Nitro SSR).
  desktop/   Electron wrapper around apps/app.
  proxy/     Hono + oRPC proxy. Executes DB queries on behalf of clients.
  cli/       CLI tool published as `conar` on npm.

packages/
  db/           Drizzle schema + migrations for the cloud PostgreSQL DB.
  connection/   DB driver wrappers, connection-string parsers, SSL/SSH utils. No Drizzle.
  query-proxy/  oRPC router factory shared between apps/api and apps/proxy.
  ai/           Vercel AI SDK tool definitions and provider env helpers.
  ui/           Shared shadcn/base-ui React components and theme.
  table/        TanStack Virtual table component and hooks.
  shared/       Cross-package utils, enums, constants, types.
  configs/      Shared TypeScript configs.
```

The **proxy app** (`apps/proxy`) is a separate Hono process that executes DB queries. Clients connect to the proxy rather than having the main API execute queries directly. This isolates query execution and lets the proxy run closer to the user's databases (e.g. as a local desktop agent or self-hosted service).

## Dev commands

```bash
pnpm run docker:start       # Start local Postgres (conar DB) and Redis via docker-compose.dev.yml
pnpm run drizzle:migrate    # Apply DB migrations (packages/db)
pnpm run drizzle:generate   # Generate migration from schema changes
pnpm run dev                # Start all apps via Turbo
pnpm run test               # Bun unit tests
pnpm run test:e2e           # Playwright E2E
pnpm run check-types        # tsc type-check across workspace
pnpm run lint               # Oxlint
```

Local URLs (via portless, requires `pnpm run dev`):

- `https://api.local.conar.app`
- `https://app.local.conar.app`
- `https://main.local.conar.app`
- `https://proxy.local.conar.app`

## Architecture constraints

| Topic        | Rule                                                                                  |
| ------------ | ------------------------------------------------------------------------------------- |
| API layer    | oRPC (`@orpc/server`) — not REST, not tRPC. Routers live in `apps/api/orpc/routers/`. |
| Client state | TanStack DB collections — not Zustand, not React Context for data.                    |
| Cloud DB ORM | Drizzle (`packages/db`) — not raw SQL, not Prisma.                                    |
| Auth         | Better Auth (`apps/api/lib/auth.ts`) — not custom JWT, not NextAuth.                  |
| Secrets      | Connection-string keys live per workspace in `workspace_encryption_keys` (Postgres), wrapped at rest by `USER_KEY_SECRET` (env) — not Infisical, never plaintext. Conar uses the key of the user's default workspace. Other encrypted columns wrap with `ENCRYPTION_SECRET`. The table is owned by the tamery/main migrations against the shared database. |
| Runtime      | Bun — not Node for server processes. Node 22+ supported as fallback.                  |
| Testing      | Bun test for unit tests. Playwright for E2E.                                          |
| Styles       | TailwindCSS v4 — no inline `style=` props for layout/theme values.                    |

## oRPC router pattern

Adding a new procedure:

```ts
// apps/api/orpc/routers/my-feature.ts
import { authMiddleware, orpc } from '~/orpc'
import { type } from '@orpc/server'

export const myProcedure = orpc
  .use(authMiddleware) // or subscriptionMiddleware, logMiddleware
  .input(type<{ id: string }>())
  .handler(async ({ input, context }) => {
    // context.user, context.session available after authMiddleware
    return { result: 'ok' }
  })
```

Then register in `apps/api/orpc/routers/index.ts`:

```ts
export const router = { ..., myFeature: { myProcedure } }
```

Available middlewares: `logMiddleware`, `authMiddleware`, `subscriptionMiddleware`, `optionalAuthMiddleware`, `optionalSubscriptionMiddleware`, `cacheMiddleware(ttl)`.

Clients call procedures via the generated `ORPCRouter` type — no manual fetch calls.

## Secrets / environment

- `apps/api/env.ts`, `apps/proxy/env.ts` etc. validate env vars with ArkType.
- Each workspace's connection-string key is a random secret in `workspace_encryption_keys`, wrapped at rest by `USER_KEY_SECRET` via the `encryptedColumn` type. Conar keeps every connection in the user's default workspace, so that workspace's key is the user's key. `ensureDefaultWorkspace(userId)` (`apps/api/lib/workspace.ts`) mints the key with the workspace (called from the auth `user.create` hook); `workspaceEncryptionKey.getForUser(userId)` reads it (`apps/api/lib/encryption-key.ts`). A workspace delete cascades the row (crypto-shred). Tamery's `20261031152301_workspace_sharing` migration moved every owner's former `user_encryption_keys` row onto their workspaces and dropped that table.
- `getUserSecret(userId)` is memoized (5 min TTL), reads the key via `workspaceEncryptionKey.getForUser`, and is available on context after `authMiddleware`.
