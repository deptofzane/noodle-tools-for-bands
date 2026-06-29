# Portable image for a long-lived Node host (Railway / Fly / Render /
# self-hosted). The app needs a persistent server — it holds a Postgres
# LISTEN connection and serves SSE — so it is NOT suitable for serverless.
#
# The container runs migrations then starts the server. Migrations are
# idempotent; for multi-instance deploys, run `pnpm db:migrate:deploy` as
# a one-off release step instead and drop it from the start command.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# --- runtime ---
FROM base AS runner
ENV NODE_ENV=production
# Hosts inject PORT; Next's `start` honors it. Default for local runs.
ENV PORT=3000
COPY --from=build /app ./
EXPOSE 3000
# Apply migrations, then start. `db:migrate:deploy` uses the runtime
# migrator (drizzle-orm + pg only), so it works without dev deps.
CMD ["sh", "-c", "pnpm db:migrate:deploy && pnpm start"]
