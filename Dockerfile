# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Bodapp — multi-stage Docker image
#
# Build            : docker compose build          (or docker build -t bodapp .)
# Generated client : npx prisma generate → src/generated/prisma
# Build script     : npm run build = next build --webpack  (Turbopack OOM-kills
#                    on the 1.9GB target box, so we pin the webpack build)
# Runtime          : Next.js standalone server.js, HTTP on port 3000, no DB at
#                    compile time. `prisma migrate deploy` runs at boot (see the
#                    `migrate` service in docker-compose.yml).
# ---------------------------------------------------------------------------

FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- Stage: deps ------------------------------------------------------
# Install ALL dependencies (prod + dev). prisma is a devDependency, but we keep
# it in the final image because `prisma migrate deploy` needs the CLI at boot.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Stage: build -----------------------------------------------------
# Generate the Prisma client + run the production build. No DATABASE_URL is
# required here — nothing touches the DB at compile time.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx --no-install prisma generate
RUN npm run build

# ---------- Stage: runner ----------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Non-root user (uid/gid 1001, matching the official Next.js standalone image).
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Full node_modules (superset of the standalone-traced set): guarantees
# @prisma/adapter-pg, pg, the generated client's deps, AND the prisma CLI are
# all present at runtime (prisma is a devDependency, so it isn't in the traced
# standalone output on its own).
COPY --from=builder /app/node_modules ./node_modules
# Next.js standalone server + static assets + public files.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Prisma schema + migrations + generated client for runtime queries & migrate.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/package.json ./package.json

# Photo storage — writable by the non-root user. Compose bind-mounts ./storage
# here (see docker-compose.yml); the host dir must be chowned to uid 1001.
RUN mkdir -p /app/storage/photos && chown -R nextjs:nodejs /app/storage

USER nextjs

EXPOSE 3000

# Self-contained standalone server — no `next start` or node_modules gymnastics.
CMD ["node", "server.js"]
