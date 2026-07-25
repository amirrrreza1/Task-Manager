FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/prisma packages/database/prisma
RUN --mount=type=cache,id=task-manager-npm,target=/root/.npm,sharing=locked \
  set -eu; \
  npm config set fetch-retries 5; \
  npm config set fetch-retry-mintimeout 20000; \
  npm config set fetch-retry-maxtimeout 120000; \
  npm config set fetch-timeout 600000; \
  npm config set maxsockets 3; \
  attempt=1; \
  until npm ci --workspace @task-manager/api --include-workspace-root --prefer-offline; do \
    if [ "$attempt" -ge 3 ]; then exit 1; fi; \
    echo "npm ci failed (attempt $attempt/3); retrying in 10 seconds..."; \
    attempt=$((attempt + 1)); \
    sleep 10; \
  done; \
  npm run prisma:generate

FROM dependencies AS builder
COPY apps/api apps/api
RUN npm run build --workspace @task-manager/api

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY --chown=node:node docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh && mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health >/dev/null || exit 1
ENTRYPOINT ["api-entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
