# syntax=docker/dockerfile:1
# Railway's Dockerfile Path for the main service; the build context is the repo root.

FROM node:24-slim AS base
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
ENV CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack install

FROM base AS build
COPY --parents pnpm-lock.yaml pnpm-workspace.yaml apps/*/package.json packages/*/package.json ./
# Root lifecycle scripts set up local dev (portless, husky, .env) and need the sources; the rebuild runs dependencies' allowed builds and keeps the filter, since an unfiltered one installs the whole workspace.
RUN pnpm install --frozen-lockfile --prefer-offline --ignore-scripts --filter @tamery/main... --filter . \
  && pnpm rebuild --filter @tamery/main... --filter .
COPY . .
ARG VITE_PUBLIC_API_URL VITE_PUBLIC_SHARE_URL VITE_PUBLIC_WEB_URL
# Inside the app's folder: at the root, pnpm's verifyDepsBeforeRun would install the whole workspace the filter left out.
RUN cd apps/main && pnpm exec turbo run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build /app/apps/main/.output ./.output
CMD ["bun", ".output/server/index.mjs"]
