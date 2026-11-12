# ---------------------------------------------------------------------------
# StockSense API - production image
# ---------------------------------------------------------------------------
# Alpine ships libssl3 (required by the Prisma engines); bcrypt provides a musl prebuild.
FROM node:22-alpine AS base
WORKDIR /app

# ---- Build stage: install all deps, generate Prisma client, compile TypeScript
FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# ---- Runtime stage: production deps only
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=4000
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
