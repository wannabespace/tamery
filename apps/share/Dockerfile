# syntax=docker/dockerfile:1
# Railway builds this with the repo root as the context.

FROM node:24-slim AS build
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun
RUN corepack enable
WORKDIR /app

COPY --parents package.json pnpm-lock.yaml pnpm-workspace.yaml apps/*/package.json packages/*/package.json ./
# The root's install scripts set up local dev and need the full sources; the rebuild runs the dependencies' own.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @tamery/share... --filter .
RUN pnpm rebuild --filter @tamery/share... --filter .

COPY . .
WORKDIR /app/apps/share
ARG VITE_PUBLIC_API_URL VITE_PUBLIC_MAIN_URL VITE_PUBLIC_POSTHOG_TOKEN VITE_PUBLIC_PROXY_URL
RUN pnpm run build

FROM oven/bun:1.4.4-slim
WORKDIR /app
COPY --from=build /app/apps/share/.output ./.output
CMD ["bun", ".output/server/index.mjs"]
