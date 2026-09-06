# F-06 implementation — apps/api production image. Built from the monorepo
# root (see the build command below), since apps/api depends on the
# workspace's @digihostel/db package (ADR-021: persistent-process host, not
# Vercel — this container is what that host actually runs).
#
# Build (from the repository root):
#   docker build -f apps/api/Dockerfile -t digihostel-api .
# Run:
#   docker run -p 8080:8080 \
#     -e DATABASE_URL=... -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... \
#     -e NODE_ENV=production \
#     digihostel-api

# Pinned to exactly the version this repository's CI (.github/workflows/ci.yml)
# and local development environment already use — never silently upgraded.
FROM node:24.19.0-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/parent-mobile/package.json apps/parent-mobile/package.json
COPY apps/student-mobile/package.json apps/student-mobile/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/api-zod/package.json packages/api-zod/package.json
COPY packages/api-client-react/package.json packages/api-client-react/package.json
COPY packages/api-spec/package.json packages/api-spec/package.json
RUN pnpm install --frozen-lockfile
COPY packages/db packages/db
COPY packages/api-zod packages/api-zod
COPY apps/api apps/api
RUN pnpm --filter @digihostel/db run build
RUN pnpm --filter @digihostel/api run build

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/parent-mobile/package.json apps/parent-mobile/package.json
COPY apps/student-mobile/package.json apps/student-mobile/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/api-zod/package.json packages/api-zod/package.json
COPY packages/api-client-react/package.json packages/api-client-react/package.json
COPY packages/api-spec/package.json packages/api-spec/package.json
# --prod + a scoped filter: only apps/api's own production dependencies and
# the workspace packages it actually depends on, not every app/package in
# the monorepo (F-06 Phase 7 — minimum required configuration).
RUN pnpm install --frozen-lockfile --prod --filter "@digihostel/api..."
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/packages/db/dist packages/db/dist

WORKDIR /repo/apps/api
# Platform-provided PORT (Phase 4) — never hard-coded; index.ts already
# reads process.env.PORT with an 8080 fallback for local/undocumented hosts.
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.js"]
