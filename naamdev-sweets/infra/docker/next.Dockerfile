# syntax=docker/dockerfile:1.7
# Shared image for the three Next.js apps. Example:
#   docker build -f infra/docker/next.Dockerfile --build-arg APP=web -t naamdev/web .
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS build
ARG APP
# Rewrites and NEXT_PUBLIC_* values are baked in at build time.
ARG API_INTERNAL_URL=http://api:4000
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_STOREFRONT_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_SUPPORT_PHONE
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_VAPID_KEY
ENV NEXT_OUTPUT=standalone API_INTERNAL_URL=$API_INTERNAL_URL
COPY . .
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi && \
    pnpm install --frozen-lockfile && pnpm --filter "@naamdev/${APP}" build

FROM node:22-bookworm-slim AS runtime
ARG APP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 APP_DIR=apps/${APP}
WORKDIR /app
RUN useradd -r -u 1001 naamdev
COPY --from=build --chown=naamdev /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=naamdev /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=naamdev /repo/apps/${APP}/public ./apps/${APP}/public
USER naamdev
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node ${APP_DIR}/server.js"]
