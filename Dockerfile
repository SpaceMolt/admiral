FROM node:22-slim AS base

# Install dependencies for better-sqlite3 native build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ─── Dependencies ────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# ─── Build ───────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm run build

# ─── Runtime ─────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3030

# better-sqlite3 needs the native .node binary at runtime
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# SQLite data lives in /app/data (process.cwd()/data) -- mount a volume for persistence
RUN mkdir -p /app/data

EXPOSE 3030

CMD ["node", "server.js"]
