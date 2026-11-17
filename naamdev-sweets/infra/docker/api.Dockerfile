# syntax=docker/dockerfile:1.7
# NAAMDEV SWEETS API — build from the monorepo root:
#   docker build -f infra/docker/api.Dockerfile -t naamdev/api .
# No apt/apk is used, so the image builds wherever the npm registry is reachable.

FROM node:22-bookworm AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo
COPY . .
# Optional extra CA (corporate proxies): docker build --secret id=extra_ca,src=/path/ca.crt …
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi && \
    pnpm install --frozen-lockfile && \
    pnpm --filter @naamdev/db generate && \
    pnpm --filter @naamdev/api build && \
    pnpm --filter @naamdev/api deploy --legacy --prod /out && \
    cp -r apps/api/dist apps/api/public /out/ && mkdir -p /out/prisma && \
    cp -r packages/db/prisma/schema.prisma packages/db/prisma/migrations /out/prisma/ && \
    cd /out && ./node_modules/.bin/prisma generate --schema prisma/schema.prisma && \
    mkdir -p /sslibs && cp -L /usr/lib/"$(uname -m)"-linux-gnu/libssl.so.3 /usr/lib/"$(uname -m)"-linux-gnu/libcrypto.so.3 /sslibs/

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=4000 UPLOAD_DIR=/data/uploads
# Prisma's query engine links against OpenSSL 3 (absent from the slim image).
COPY --from=build /sslibs/ /usr/local/lib/
RUN ldconfig && useradd -r -u 1001 naamdev && mkdir -p /data/uploads /app && chown -R naamdev:naamdev /data /app
WORKDIR /app
COPY --from=build --chown=naamdev:naamdev /out ./
USER naamdev
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations (non-destructive) then start the server.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma && node dist/index.js"]
