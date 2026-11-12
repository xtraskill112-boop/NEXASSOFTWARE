# ---------------------------------------------------------------------------
# StockSense web client - built with Vite, served by nginx
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Set to "false" to hide the demo-account helper on the login page.
ARG VITE_SHOW_DEMO_ACCOUNTS=true
ENV VITE_SHOW_DEMO_ACCOUNTS=$VITE_SHOW_DEMO_ACCOUNTS
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
