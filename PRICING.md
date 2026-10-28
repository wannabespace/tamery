# Pricing model

Internal doc: how Tamery's pricing works and how to decide where a new feature lands. Not user-facing.

## Core principle

**No feature is a Pro feature. Scale is Pro.**

Every user sees the whole product. Free users hit quantity limits when they use it seriously; Pro removes the limits. We gate by _how much_ someone uses Tamery, not by _what_ they are allowed to touch.

Why this model (and not feature gating):

- Limits self-segment. A hobbyist with one database stays under the limits forever and spreads word of mouth. A professional with ten work databases hits the wall within a week and pays.
- Free users experience AI, sync, and workspaces before paying — conversion beats a paywall that hides the value.
- "Is this feature Free or Pro?" stops being a judgment call. New features ship to everyone; the only question is which existing limit they fall under.

## Tiers

| Metric | Free | Pro |
| --- | --- | --- |
| Connections | 3 | Unlimited |
| Workspaces | 1 (personal, auto-created) | Unlimited |
| AI requests | Limited per week, or unlimited with BYOK | Unlimited filters; included credits, then bought credits, for the rest |
| Cloud sync | Included (within connection limit) | Included |
| Chats & query history | Limited retention | Unlimited |

Exact numbers are product decisions and may change; the structure should not.

BYOK (bring your own API key) keeps AI usable on Free at zero token cost to us. It also serves privacy-sensitive users who don't want their queries going through our provider account.

## Decision framework for new features

Run every new feature through these questions, in order. The first match wins.

### 1. Does it have a natural quantity?

Connections, workspaces, AI requests, saved queries, history retention, sync targets.

→ **Ship to everyone. Attach it to an existing limit, or define a new limit** (generous enough that casual use never hits it). Never invent a boolean gate for something countable.

### 2. Does it create recurring marginal cost per use?

AI tokens, storage, compute we pay for per request.

→ **Ship to everyone with a Free usage cap; Pro spends included credits, then bought credits.** Never make a per-use cost unlimited. If the cost is user-transferable (AI), offer BYOK on Free.

### 3. Is it collaboration between people?

Members, invitations, shared workspaces, roles, audit.

→ **Team tier** (future). Per-seat pricing. Multi-player is the one category that is genuinely a different product promise, not a bigger quota.

### 4. None of the above — a pure capability?

New database driver, editor improvement, keyboard shortcuts, UI polish, export formats, local-only functionality.

→ **Free, for everyone, always.** Capabilities grow the funnel; limits monetize it. Gating a capability restarts the "randomly picking Pro features" problem this document exists to prevent.

### Litmus tests

Before shipping a gate, check:

- **Explainability**: can a user guess _why_ this is limited without reading docs? "3 connections free" explains itself; "table filters are Pro" does not.
- **Symmetry**: would we be embarrassed if a competitor's changelog said "we made X free"? If yes, X should be free here too.
- **No hostage features**: never gate something that makes the free product feel broken (e.g. viewing data, running queries, editing rows). Free must be a complete tool at small scale.

## What stays free forever

Commitments we don't walk back — churning these breaks trust:

- Working with a local connection end to end: connect, browse, query, edit.
- `SyncType: Local` — data never leaving the device is a right, not a plan feature.
- Anything already shipped as free. Limits may apply to _new_ accounts, but features don't move behind the paywall retroactively.

## Planned reworks

Where today's wiring contradicts the framework. Read the routers for the current state; this is the direction, in priority order, each naming the principle it serves.

1. **One pooled AI quota instead of a hard paywall.** Every AI endpoint shares one weekly counter (a `FREE_WEEKLY_LIMITS` entry, counted through `apps/api/lib/usage.ts`) behind `optionalSubscriptionMiddleware`; a subscription skips it. A hard gate hides the product's best conversion surface from free users, and per-feature counters produce a plan nobody can describe. The story has to fit one sentence: "N AI filters a week free, unlimited on Pro; other AI spends Pro credits, buy more when they run out."
2. **Gate generation, never chat persistence.** Storing chat rows costs nothing, and a lapsed subscriber must not lose the ability to edit or delete their own history. Chats and messages mutations belong on `authMiddleware`; the model call is the enforcement point. Retention, if ever needed, is a quantity limit.
3. **Implement the connection limit before tiers launch** — it is the model's primary quantity lever. Count server-side in `connections/create`, block only new creates, and ship the UI mirror in the same release: a silent server rejection reads as a bug, not a plan.
4. **BYOK is the free tier's AI escape hatch.** A user-stored provider key (per-user secret in Infisical, same path as encryption secrets) routes AI calls to it and skips the quota entirely — which makes the free story honest, serves privacy-sensitive users, and removes token cost as an argument for hard gates.
5. **One limit contract.** Every limit, metered or quantity, reports through `usage.get` as a `{ max, used, resetAt }` quota, so clients share one upgrade-prompt component instead of per-feature paywall screens.
6. **Workspace gating stays as it is** — one free personal workspace is a quantity limit. When members and invitations ship, resist moving _collaboration_ under Pro: multi-player belongs to a per-seat Team tier and Pro stays a single-player scale upgrade. Deciding this now avoids re-gating workspaces twice.

## Team tier ideas

Proposals for shared workspaces (members, invitations, roles Owner / Editor / Viewer), not decisions yet. Until they are decided, creating a workspace stays Pro and anyone with an account can be invited.

- **Seats are Editors.** Bill per Editor; Viewers are free (or free up to a generous count). Viewers only use connections someone else maintains and cost us nothing, and free Viewers let a team pull in the whole company — the land-and-expand path.
- **The workspace pays, not the member.** An invited Free user works in a paid workspace without upgrading; the workspace's plan sets the limits inside it, the member's own plan sets them in their Personal workspace.
- **Count limits per workspace, not per author.** The connection limit counts the author's rows today, so a Free Editor in a paid workspace would hit 3 there. Shared workspaces need the count scoped to the workspace's plan before Team launches.
- **A free taste of sharing.** One shared workspace with one invitee on Free (or Pro) keeps "collaboration is Team" honest while letting a pair try it — the limit is a natural quantity (members), so it passes the explainability test. Sending the second invite is the upgrade moment, with a 14-day Team trial.
- **Pooled AI credits per workspace.** Team credits belong to the workspace, so a heavy user doesn't need their own Pro.
- **Real enforcement as the Team/Enterprise differentiator.** Today anyone who can open a connection can read its password. A workspace policy that runs Viewers only through the cloud proxy (the string never reaches their device), a policy forcing **No password** / **Metadata only** sync, and an audit log of who opened or copied which connection are worth paying for and cost us real infra.
- **SSO / SCIM and domain capture** (anyone with `@company.com` joins automatically) are Enterprise.
- **A lapsed Team never locks anyone out.** Members keep using existing connections; only new invites, new Editors and new connections are blocked (implementation rule 6).

## Implementation rules

How to wire a gate once the framework has decided where a feature lands:

1. **Gate at the API boundary, never only in the client.** The desktop app, web app, and CLI all speak to the same oRPC routers; a client-side check is a suggestion, not a limit. UI may _mirror_ the limit (disable buttons, show upgrade prompts) but the router enforces it. The one exception is work the client runs itself (MCP queries against the user's own database): the API can only count it, so the client checks `usage.get` before a run and reports it through `usage.record`, which never refuses, and an unreachable API fails open. Meter that way only what costs us nothing when bypassed.
2. **Metered features copy the `ai/filters` pattern** (`apps/api/orpc/routers/ai/v2/filters.ts`): `permissionsMiddleware`, then `usage.get` before the work and `usage.record` after it (`apps/api/lib/usage.ts`, Redis `usage:{userId}:{feature}:{resetsAt}` expiring when the period ends). That file maps each feature to its `unlimited` permission; when it passes, both return `null` and nothing is counted. Clients read every quota from the one `usage.get` endpoint; the `usage.record` endpoint exists only for runs the client performs itself (rule 1).
3. **Clients read the numbers from `usage.get`, not from the error.** The quota it returns (`{ max, used, resetAt }`) lets every client render "37 of 50 left, resets March 1" and the upgrade prompt before the call; refresh it after a metered call. A refusal is a declared `FORBIDDEN` with an upgrade message and no data — never a per-feature error payload.
4. **Limits live in `FREE_WEEKLY_LIMITS` (`packages/shared/usage.ts`)**, one weekly max per metered feature, all resetting Monday 00:00 UTC. Shared package so clients render the same numbers the server enforces — no hardcoded copies in UI code.
5. **Boolean gates use `permix.checkMiddleware('<entity>.<action>')` after `permissionsMiddleware`; metered ones go through `usage` (rule 2).** Reserve the hard check for things that are structurally Pro/Team (extra workspaces, future member management), not for capping usage.
6. **Quantity limits (connections, workspaces) are enforced on create**, counting server-side rows — never trust a client-reported count. Existing over-limit data stays readable when a subscription lapses; the limit blocks _new_ creates only. Downgrade must never lock users out of their data.
7. **Grandfathering by app version already has a pattern**: permix's `onForbidden` (`apps/api/orpc/index.ts`) branches its message on `LATEST_VERSION_BEFORE_SUBSCRIPTION`. When a previously free surface gains a gate, keep the version-aware messaging so old clients get an actionable error.

## Surface-specific rules

- **CLI (`apps/cli`) and desktop (`apps/desktop`) are distribution channels, not tiers.** Never gate "CLI access" or "desktop app" — they call the same routers and inherit the same limits. A Pro-only client would just push users to the ungated one.
- **Proxy (`apps/proxy`) query execution stays free.** Running queries against the user's own database is core capability (question 4); the user's database does the work, not our infra.
- **Table browsing, query editor, definitions, visualizer** (`apps/app/src/routes/_protected/connection/$resourceId/*`) — capabilities, free. New pages under a connection default to free unless they call a metered AI endpoint, in which case the endpoint's meter is the gate, not the page.
- **Sync is never its own toggle.** `SyncType` is the user's privacy choice, not a plan feature. Cloud sync applies to whatever the user's limits allow them to have; you gate the _number of connections_, not their syncability.
- **Secrets resolution (`connections/resolve`, Infisical) follows the connection.** If the user may have the connection, they may resolve its string on any device — gating resolve separately would hold synced credentials hostage (violates the hostage-feature test).
- **AI title generation and similar micro-LLM calls stay free** while per-call cost is negligible; promote to metered only if a cost report shows otherwise, and then via rule 2, not a hard gate.

## Explicitly rejected models

- **Feature gating** (random features marked Pro) — no principle, every new feature reopens the debate, free product feels arbitrarily crippled.
- **Paid-only with trial** — kills word of mouth against free competitors (DBeaver, Beekeeper); our infra cost doesn't require it.
- **One-time license** (TablePlus model) — viable given near-zero infra cost, but weaker long-term revenue and awkward with recurring AI cost. Revisit only if the audience demands it; BYOK or AI credits would cover the token side.
