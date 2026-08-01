FROM node:24-alpine AS dependencies
WORKDIR /app
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN --mount=type=cache,id=task-manager-pnpm,target=/root/.local/share/pnpm/store,sharing=locked \
  pnpm install --frozen-lockfile --filter @task-manager/web...

FROM dependencies AS builder
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ARG NEXT_PUBLIC_CALENDAR=gregorian
ARG NEXT_PUBLIC_COMPANY_NAME="Task Manager"
ARG NEXT_PUBLIC_COMPANY_ICON=/icon.svg
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CALENDAR=$NEXT_PUBLIC_CALENDAR
ENV NEXT_PUBLIC_COMPANY_NAME=$NEXT_PUBLIC_COMPANY_NAME
ENV NEXT_PUBLIC_COMPANY_ICON=$NEXT_PUBLIC_COMPANY_ICON
COPY apps/web apps/web
RUN pnpm --filter @task-manager/web build

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
