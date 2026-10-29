# syntax=docker/dockerfile:1
# Every Tamery service on Railway builds from this file; its APP variable (api, proxy, app, main, docs, share) picks the app.

FROM node:24-slim AS base
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
ENV CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack install

FROM base AS build
ARG APP
COPY --parents pnpm-lock.yaml pnpm-workspace.yaml apps/*/package.json packages/*/package.json ./
# Root lifecycle scripts set up local dev (portless, husky, .env) and need the sources; dependencies' allowed builds run in the rebuild.
# The rebuild keeps the filter: an unfiltered one installs the whole workspace.
RUN pnpm install --frozen-lockfile --prefer-offline --ignore-scripts --filter "@tamery/${APP:?set the APP variable}..." --filter . \
  && pnpm rebuild --filter "@tamery/$APP..." --filter .
COPY . .
ARG VITE_PUBLIC_API_URL VITE_PUBLIC_MAIN_URL VITE_PUBLIC_POSTHOG_TOKEN VITE_PUBLIC_PROXY_URL VITE_PUBLIC_SHARE_URL VITE_PUBLIC_WEB_URL
# Runs inside the app's folder: at the root, pnpm's verifyDepsBeforeRun would install the whole workspace the filter left out.
RUN cd "apps/$APP" && case "$APP" in \
    api|proxy) pnpm exec turbo run check-types ;; \
    *) pnpm exec turbo run build ;; \
  esac

FROM base
ARG APP
ENV APP=$APP
COPY --from=build /app /app
CMD cd "apps/$APP" && pnpm run start
