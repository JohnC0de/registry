# syntax=docker/dockerfile:1
# Production image for a TanStack Start app built with `vite build` and run on Bun.
# Base images are pinned by digest for reproducible builds. To bump: `docker pull oven/bun:1`
# (and `oven/bun:1-slim`), then copy the new `docker inspect --format '{{index .RepoDigests 0}}'`.

FROM oven/bun:1@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS base

FROM base AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# Typecheck gates the build: a type error fails the image. The route tree is generated first
# because tsc needs src/routeTree.gen.ts.
RUN bun x tsr generate && bun x tsc --noEmit && bun run build

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --chown=bun:bun package.json serve.ts ./
# Non-root: the image ships the unprivileged `bun` user.
USER bun
EXPOSE 3000
# Liveness only (no DB I/O). /api/health comes from @john/health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["bun", "-e", "const r = await fetch(`http://localhost:${process.env.PORT}/api/health`); process.exit(r.ok ? 0 : 1)"]
CMD ["bun", "run", "serve.ts"]
