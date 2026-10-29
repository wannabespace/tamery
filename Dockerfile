# syntax=docker/dockerfile:1
# Every Tamery service on Railway builds from this file with the repo root as context. Its APP variable names the app; RUNTIME picks the image: server (api, proxy), static (app) or nitro (main, docs, share).
ARG RUNTIME

FROM node:24-slim AS base
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
ENV CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack install

FROM base AS build
ARG APP
COPY --parents pnpm-lock.yaml pnpm-workspace.yaml apps/*/package.json packages/*/package.json ./
# Root lifecycle scripts set up local dev (portless, husky, .env) and need the sources; the rebuild runs dependencies' allowed builds and keeps the filter, since an unfiltered one installs the whole workspace.
RUN pnpm install --frozen-lockfile --prefer-offline --ignore-scripts --filter "@tamery/${APP:?set the APP variable}..." --filter . \
  && pnpm rebuild --filter "@tamery/$APP..." --filter .
COPY . .
# Inside the app's folder: at the root, pnpm's verifyDepsBeforeRun would install the whole workspace the filter left out.
WORKDIR /app/apps/$APP

FROM build AS server
RUN pnpm exec turbo run check-types
CMD ["pnpm", "run", "start"]

FROM build AS bundle
ARG VITE_PUBLIC_API_URL VITE_PUBLIC_MAIN_URL VITE_PUBLIC_POSTHOG_TOKEN VITE_PUBLIC_PROXY_URL VITE_PUBLIC_SHARE_URL VITE_PUBLIC_WEB_URL
# Bundle stage only: no shipped stage may declare this secret.
ARG POSTHOG_PERSONAL_API_KEY
RUN pnpm exec turbo run build

FROM node:24-slim AS static
ARG APP
RUN npm install --global serve@14
WORKDIR /app
COPY --from=bundle /app/apps/$APP/dist ./dist
CMD serve -s dist -l $PORT

FROM oven/bun:1-slim AS nitro
ARG APP
WORKDIR /app
COPY --from=bundle /app/apps/$APP/.output ./.output
CMD ["bun", ".output/server/index.mjs"]

FROM $RUNTIME
