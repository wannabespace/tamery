# syntax=docker/dockerfile:1
# Railway builds this with the repo root as the context.

FROM node:24-slim AS build
# posthog-cli, which uploads the sourcemaps, reads the system CA store that the slim image leaves out.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun
RUN corepack enable
WORKDIR /app

COPY --parents package.json pnpm-lock.yaml pnpm-workspace.yaml apps/*/package.json packages/*/package.json ./
# The root's install scripts set up local dev and need the full sources; the rebuild runs the dependencies' own.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @tamery/app... --filter .
RUN pnpm rebuild --filter @tamery/app... --filter .

COPY . .
WORKDIR /app/apps/app
ARG VITE_PUBLIC_API_URL VITE_PUBLIC_MAIN_URL VITE_PUBLIC_POSTHOG_TOKEN VITE_PUBLIC_PROXY_URL VITE_PUBLIC_SHARE_URL VITE_PUBLIC_WEB_URL
# Build stage only: the image below must never declare this secret.
ARG POSTHOG_PERSONAL_API_KEY
RUN pnpm run build

FROM node:24-slim
RUN npm install --global serve@14
WORKDIR /app
COPY --from=build /app/apps/app/dist ./dist
CMD serve -s dist -l $PORT
