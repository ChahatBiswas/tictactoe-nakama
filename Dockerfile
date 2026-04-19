# Stage 1 — build the Nakama JS bundle
FROM node:18-alpine AS builder
WORKDIR /app
COPY server/package*.json ./
RUN npm ci
COPY server/ .
RUN npm run build

# Stage 2 — Nakama runtime with our bundle
FROM registry.heroiclabs.com/heroiclabs/nakama:3.22.0
COPY --from=builder /app/build/index.js /nakama/data/modules/index.js

EXPOSE 7349 7350 7351

ENTRYPOINT ["/bin/sh", "-c"]
CMD ["/nakama/nakama migrate up --database.address \"$DATABASE_URL\" && exec /nakama/nakama --name nakama1 --database.address \"$DATABASE_URL\" --socket.server_key defaultkey --logger.level INFO --session.token_expiry_sec 7200 --runtime.path /nakama/data/modules --runtime.js_entrypoint index.js"]
