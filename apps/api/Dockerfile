FROM node:24-alpine AS dependencies
WORKDIR /app
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/prisma packages/database/prisma
RUN --mount=type=cache,id=task-manager-pnpm,target=/root/.local/share/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --filter @task-manager/api... && \
  pnpm run prisma:generate

FROM dependencies AS builder
COPY apps/api apps/api
RUN pnpm --filter @task-manager/api build

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
