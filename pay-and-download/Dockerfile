FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/app/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
# Payments, settings and uploaded files live here: mount a persistent volume on it.
VOLUME /app/data
EXPOSE 3000
CMD ["node", "server.js"]
