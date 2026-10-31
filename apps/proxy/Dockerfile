# syntax=docker/dockerfile:1
# Railway builds this with the repo root as the context.

FROM node:24-slim
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun
RUN corepack enable
WORKDIR /app

COPY --parents package.json pnpm-lock.yaml pnpm-workspace.yaml apps/*/package.json packages/*/package.json ./
# The root's install scripts set up local dev and need the full sources; the rebuild runs the dependencies' own.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @tamery/proxy... --filter .
RUN pnpm rebuild --filter @tamery/proxy... --filter .

COPY . .
WORKDIR /app/apps/proxy
RUN pnpm run check-types
CMD ["pnpm", "run", "start"]
