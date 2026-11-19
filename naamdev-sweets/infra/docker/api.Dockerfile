# syntax=docker/dockerfile:1.7
# NAAMDEV SWEETS API (Cloud Run) — build from the monorepo root:
#   docker build -f infra/docker/api.Dockerfile -t naamdev-api .
# Data lives in Firestore; credentials come from the Cloud Run service account (no keys in the image).

FROM node:22-bookworm AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo
COPY . .
# Optional extra CA (corporate proxies): docker build --secret id=extra_ca,src=/path/ca.crt …
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi && \
    pnpm install --frozen-lockfile && \
    pnpm --filter @naamdev/api build && \
    pnpm --filter @naamdev/api deploy --legacy --prod /out && \
    cp -r apps/api/dist apps/api/public /out/

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=4000
RUN useradd -r -u 1001 naamdev && mkdir -p /app && chown naamdev:naamdev /app
WORKDIR /app
COPY --from=build --chown=naamdev:naamdev /out ./
USER naamdev
EXPOSE 4000
CMD ["node", "dist/index.js"]
