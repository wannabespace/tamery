# syntax=docker/dockerfile:1
# Built with the repo root as the context.

FROM node:24-slim AS base
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun
RUN corepack enable
WORKDIR /app
COPY --parents package.json pnpm-lock.yaml pnpm-workspace.yaml apps/*/package.json packages/*/package.json ./

FROM base AS checked
# The root's install scripts set up local dev and need the full sources; the rebuild runs the dependencies' own.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @tamery/proxy... --filter .
RUN pnpm rebuild --filter @tamery/proxy... --filter .
COPY . .
RUN pnpm --dir apps/proxy run check-types

# Production dependencies only: the dev tools the check needs, such as TypeScript's native compiler, stay out of the image.
FROM base
# A production-only install looks stale to pnpm, which would then reinstall the whole workspace before every `pnpm run`.
ENV pnpm_config_verify_deps_before_run=false
# @tamery/connection loads the drivers proxy declares as its peers, and a workspace package sees only its own node_modules unless they are hoisted.
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --shamefully-hoist --filter @tamery/proxy...
RUN pnpm rebuild --filter @tamery/proxy...
COPY . .
# Without a reference to the checked stage BuildKit skips it, and the type check with it.
COPY --from=checked /app/apps/proxy/package.json /tmp/checked
WORKDIR /app/apps/proxy
CMD ["pnpm", "run", "start"]
