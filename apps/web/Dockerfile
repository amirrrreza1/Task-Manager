FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN --mount=type=cache,id=task-manager-npm,target=/root/.npm,sharing=locked \
  set -eu; \
  npm config set fetch-retries 5; \
  npm config set fetch-retry-mintimeout 20000; \
  npm config set fetch-retry-maxtimeout 120000; \
  npm config set fetch-timeout 600000; \
  npm config set maxsockets 3; \
  attempt=1; \
  until npm ci --workspace @task-manager/web --include-workspace-root --prefer-offline; do \
    if [ "$attempt" -ge 3 ]; then exit 1; fi; \
    echo "npm ci failed (attempt $attempt/3); retrying in 10 seconds..."; \
    attempt=$((attempt + 1)); \
    sleep 10; \
  done

FROM dependencies AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY apps/web apps/web
RUN npm run build --workspace @task-manager/web

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
