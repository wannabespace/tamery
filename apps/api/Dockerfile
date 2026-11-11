# syntax=docker/dockerfile:1
# Built with the repo root as the context.

FROM node:24-slim AS base
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun
RUN corepack enable
WORKDIR /app
COPY --parents package.json pnpm-lock.yaml pnpm-workspace.yaml apps/*/package.json packages/*/package.json ./

FROM base AS checked
# The root's install scripts set up local dev and need the full sources; the rebuild runs the dependencies' own.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @tamery/api... --filter .
RUN pnpm rebuild --filter @tamery/api... --filter .
COPY . .
RUN pnpm --dir apps/api run check-types

# Production dependencies only: the dev tools the check needs, such as TypeScript's native compiler, stay out of the image.
FROM base
# A production-only install looks stale to pnpm, which would then reinstall the whole workspace before every `pnpm run`.
ENV pnpm_config_verify_deps_before_run=false
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --filter @tamery/api...
# Dropped for its CVEs: nothing in the image may run npm or npx, pnpm comes from corepack.
RUN pnpm rebuild --filter @tamery/api... && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY . .
# Without a reference to the checked stage BuildKit skips it, and the type check with it.
COPY --from=checked /app/apps/api/package.json /tmp/checked
WORKDIR /app/apps/api
# Keep in step with package.json's `start`. Not `pnpm run start`: as PID 1 pnpm never passes SIGTERM on, so lib/shutdown.ts never drains.
CMD ["env", "NODE_ENV=production", "bun", "run", "./index.ts"]
