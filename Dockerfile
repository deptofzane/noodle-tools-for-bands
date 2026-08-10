# Portable image for a long-lived Node host (Railway / Fly / Render /
# self-hosted). The app needs a persistent server — it holds a Postgres
# LISTEN connection and serves SSE — so it is NOT suitable for serverless.
#
# Migrations are NOT run here. They're a pre-deploy step (see railway.json),
# which is what keeps a scaled-out deploy from racing several instances
# through the same migration at boot. Anything running this image outside
# Railway must run `pnpm db:migrate:deploy` before starting it.

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

# `NEXT_PUBLIC_*` is inlined into the client bundle at build time, so these
# have to be present HERE — setting them on the running container does
# nothing. Without them the image ships a Picker that reports its API key
# isn't set and a push subscription that can't find its VAPID key.
#
# Railway injects service variables into the build, but only for names the
# Dockerfile declares as ARG, and only in the stage that declares them.
# Elsewhere, pass them with `--build-arg`. All three are public by design —
# they reach the browser either way — so a build arg is the right vehicle.
#
# Deliberately absent: SENTRY_AUTH_TOKEN. Build args are recorded in image
# history, which is no place for a credential. Sentry uploads source maps
# only when it sees one (see next.config.ts) and the build succeeds without
# it, so releases are un-symbolicated until it's supplied some other way —
# a BuildKit secret mount on a self-built image, or a separate upload step.
ARG NEXT_PUBLIC_GOOGLE_API_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_DROPBOX_APP_KEY
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV NEXT_PUBLIC_GOOGLE_API_KEY=$NEXT_PUBLIC_GOOGLE_API_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_DROPBOX_APP_KEY=$NEXT_PUBLIC_DROPBOX_APP_KEY
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT

RUN pnpm build

# --- runtime ---
FROM base AS runner
ENV NODE_ENV=production
# Hosts inject PORT; Next's `start` honors it. Default for local runs.
ENV PORT=3000
COPY --from=build /app ./
EXPOSE 3000
# Start only. Migrations run as a pre-deploy step — see the header.
CMD ["pnpm", "start"]
