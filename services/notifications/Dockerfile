FROM node:20-alpine AS base
RUN npm install -g pnpm@8.15.4

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY .npmrc* ./
COPY packages ./packages
COPY services/notifications ./services/notifications
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rt/contracts build && pnpm --filter @rt/utils build && pnpm --filter @rt/data-mongo build && pnpm --filter @rt/cloud-aws build && pnpm --filter @rt/service-notifications build

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/notifications/dist ./dist
COPY --from=builder /app/services/notifications/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
EXPOSE 3004
CMD ["node", "dist/index.js"]
